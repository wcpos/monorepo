import * as React from 'react';

import get from 'lodash/get';
// @ts-expect-error: semver lacks type declarations in this project
import semver from 'semver';

import { useHttpClient } from '@wcpos/hooks/use-http-client';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';

const discoveryLogger = getLogger(['wcpos', 'auth', 'discovery']);

class ApiDiscoveryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ApiDiscoveryError';
	}
}

export type ApiDiscoveryStatus = 'idle' | 'discovering' | 'success' | 'error';

interface WpJsonResponse {
	uuid: string;
	authentication: {
		'application-passwords'?: {
			endpoints: {
				authorization: string;
			};
		};
		wcpos?: {
			endpoints: {
				authorization: string;
			};
		};
	};
	description: string;
	gmt_offset: string;
	home: string;
	name: string;
	namespaces: string[];
	routes: Record<string, unknown>;
	site_logo: string;
	timezone_string: string;
	url: string;
	wp_version?: string;
	wc_version?: string;
	wcpos_version?: string;
	wcpos_pro_version?: string;
	license?: {
		key: string;
		status: string;
		instance: string;
		expires: string;
	};
	_links: Record<string, unknown>;
}

interface ApiEndpoints {
	wp_api_url: string;
	wc_api_url: string;
	wcpos_api_url: string;
	wcpos_login_url: string;
}

interface UseApiDiscoveryReturn {
	status: ApiDiscoveryStatus;
	error: string | null;
	siteData: WpJsonResponse | null;
	endpoints: ApiEndpoints | null;
	discoverApiEndpoints: (
		wpApiUrl: string
	) => Promise<{ siteData: WpJsonResponse; endpoints: ApiEndpoints }>;
}

/**
 * Hook for discovering and validating WordPress API endpoints
 * Validates namespaces and versions for WooCommerce and WCPOS
 */
export const useApiDiscovery = (): UseApiDiscoveryReturn => {
	const [status, setStatus] = React.useState<ApiDiscoveryStatus>('idle');
	const [error, setError] = React.useState<string | null>(null);
	const [siteData, setSiteData] = React.useState<WpJsonResponse | null>(null);
	const [endpoints, setEndpoints] = React.useState<ApiEndpoints | null>(null);
	const http = useHttpClient();
	const t = useT();

	const handleApiError = React.useCallback(
		(error: unknown, wpApiUrl: string): never => {
			// If it's already one of our logged errors, re-throw
			if (error instanceof ApiDiscoveryError) {
				throw error;
			}

			const errorCode = get(error, ['code']);
			if (errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT') {
				throw new ApiDiscoveryError(t('auth.site_took_too_long_to_respond'));
			}

			const errorResponse = get(error, ['response']);
			if (errorResponse) {
				const status = get(errorResponse, 'status');
				const contentType = get(errorResponse, ['headers', 'content-type']);
				const isRestrictedApi =
					(status === 401 || status === 403) &&
					typeof contentType === 'string' &&
					contentType.includes('application/json');

				if (isRestrictedApi) {
					// A security plugin (e.g. Force Login) is blocking REST API access
					const serverMessage = get(errorResponse, ['data', 'message']);
					const errorMsg =
						typeof serverMessage === 'string' && serverMessage.length > 0
							? serverMessage
							: t('auth.rest_api_restricted');
					discoveryLogger.error(errorMsg, {
						showToast: true,
						code: ERROR_CODES.AUTH_PLUGIN_CONFLICT,
						context: { wpApiUrl, httpStatus: status },
					});
					throw new ApiDiscoveryError(errorMsg);
				}

				// Server responded but not with the expected WP REST API format
				discoveryLogger.error('API discovery returned an invalid response', {
					showToast: true,
					code: ERROR_CODES.AUTH_UNEXPECTED,
					toast: { title: t('auth.bad_api_response') },
					context: { wpApiUrl, httpStatus: status },
				});
				throw new ApiDiscoveryError(t('auth.bad_api_response'));
			}

			discoveryLogger.error(`Failed to connect to ${wpApiUrl}: ${getErrorMessage(error)}`, {
				showToast: true,
				code: ERROR_CODES.AUTH_UNEXPECTED,
				context: { wpApiUrl },
			});
			throw error;
		},
		[t]
	);

	/**
	 * Fetch and validate WordPress API discovery data
	 */
	const fetchApiIndex = React.useCallback(
		async (wpApiUrl: string): Promise<WpJsonResponse> => {
			try {
				// Mark requests for CORS and bound them like the url-discovery probes
				// (monorepo#1155: an unbounded connect-flow request leaves the cashier
				// on an infinite spinner). The legacy fallback may return the full API
				// index, which was observed taking ~9s on a degraded-but-alive server.
				const baseUrl = wpApiUrl.endsWith('/') ? wpApiUrl : `${wpApiUrl}/`;
				let response;
				try {
					response = await http.get(`${baseUrl}wcpos/v2/site`, {
						params: { wcpos: 1 },
						timeout: 15_000,
					});
				} catch (error: unknown) {
					if (get(error, ['response', 'status']) !== 404) {
						throw error;
					}
					response = await http.get(wpApiUrl, { params: { wcpos: 1 }, timeout: 15_000 });
				}
				const data = get(response, 'data') as WpJsonResponse;

				// Basic validation
				if (!data || typeof data !== 'object') {
					discoveryLogger.error(`Bad API response from ${wpApiUrl}`, {
						showToast: true,
						code: ERROR_CODES.AUTH_UNEXPECTED,
						context: { wpApiUrl },
					});
					throw new ApiDiscoveryError(t('auth.bad_api_response'));
				}

				const namespaces = get(data, 'namespaces');
				if (!namespaces || !Array.isArray(namespaces)) {
					discoveryLogger.error(`WordPress API not found at ${wpApiUrl}`, {
						showToast: true,
						code: ERROR_CODES.AUTH_UNEXPECTED,
						context: {
							wpApiUrl,
						},
					});
					throw new ApiDiscoveryError(t('auth.wordpress_api_not_found'));
				}

				discoveryLogger.debug(
					`WordPress API discovered: ${data.name} (WC ${data.wc_version}, WCPOS ${data.wcpos_version})`
				);
				return data;
			} catch (error: unknown) {
				return handleApiError(error, wpApiUrl);
			}
		},
		[handleApiError, http, t]
	);

	/**
	 * Validate required namespaces and versions
	 */
	const validateApiRequirements = React.useCallback(
		(data: WpJsonResponse): void => {
			const namespaces = data.namespaces;
			const wcNamespace = 'wc/v3';
			const wcposNamespace = 'wcpos/v2';

			// Check for WooCommerce API
			if (!namespaces.includes(wcNamespace)) {
				discoveryLogger.error('WooCommerce API not found', {
					showToast: true,
					code: ERROR_CODES.WOOCOMMERCE_MISSING,
				});
				throw new Error(t('auth.woocommerce_api_not_found'));
			}

			// Check for WCPOS API
			if (!namespaces.includes(wcposNamespace)) {
				discoveryLogger.error('WooCommerce POS plugin not found', {
					showToast: true,
					code: ERROR_CODES.REST_ROUTE_MISSING,
				});
				throw new Error(t('auth.woocommerce_pos_api_not_found'));
			}

			// Check WCPOS version (should be >= 1.8.0 for proper auth endpoints)
			const wcposVersion = data.wcpos_version || data.wcpos_pro_version;
			if (wcposVersion && !semver.gte(wcposVersion, '1.8.0')) {
				discoveryLogger.warn(
					`WCPOS version ${wcposVersion} may not support all features (recommend 1.8.0+)`
				);
			}
		},
		[t]
	);

	/**
	 * Validate authentication endpoints and extract login URL
	 */
	const validateAuthEndpoints = React.useCallback(
		(data: WpJsonResponse): string => {
			const auth = data.authentication;

			if (!auth || typeof auth !== 'object') {
				discoveryLogger.error('Authentication configuration not found', {
					showToast: true,
					code: ERROR_CODES.REST_ROUTE_MISSING,
				});
				throw new Error(t('auth.authentication_configuration_not_found'));
			}

			// Check for WCPOS auth endpoint (required for proper authentication)
			const wcposAuth = auth.wcpos;
			if (!wcposAuth || !wcposAuth.endpoints || !wcposAuth.endpoints.authorization) {
				discoveryLogger.error('WCPOS authentication endpoint not found', {
					showToast: true,
					code: ERROR_CODES.REST_ROUTE_MISSING,
				});
				throw new Error(t('auth.wcpos_authentication_endpoint_not_found_please'));
			}

			const loginUrl = wcposAuth.endpoints.authorization;
			if (!loginUrl || typeof loginUrl !== 'string') {
				discoveryLogger.error('WCPOS login URL is invalid', {
					showToast: true,
					code: ERROR_CODES.STORE_URL_INVALID,
				});
				throw new Error(t('auth.wcpos_login_url_is_invalid_please'));
			}

			return loginUrl;
		},
		[t]
	);

	/**
	 * Build API endpoint URLs
	 */
	const buildEndpoints = React.useCallback(
		(wpApiUrl: string, wcposLoginUrl: string): ApiEndpoints => {
			// Ensure wpApiUrl ends with a slash
			const baseUrl = wpApiUrl.endsWith('/') ? wpApiUrl : `${wpApiUrl}/`;

			return {
				wp_api_url: baseUrl,
				wc_api_url: `${baseUrl}wc/v3/`,
				wcpos_api_url: `${baseUrl}wcpos/v2/`,
				wcpos_login_url: wcposLoginUrl,
			};
		},
		[]
	);

	/**
	 * Main discovery function
	 */
	const discoverApiEndpoints = React.useCallback(
		async (wpApiUrl: string): Promise<{ siteData: WpJsonResponse; endpoints: ApiEndpoints }> => {
			if (!wpApiUrl || wpApiUrl.trim() === '') {
				const errorMsg = t('auth.wordpress_api_url_is_required');
				discoveryLogger.error(errorMsg, {
					showToast: true,
					code: ERROR_CODES.STORE_URL_INVALID,
				});
				setSiteData(null);
				setEndpoints(null);
				setError(errorMsg);
				setStatus('error');
				throw new Error(errorMsg);
			}

			setStatus('discovering');
			setError(null);
			setSiteData(null);
			setEndpoints(null);

			try {
				// Step 1: Fetch WordPress API index
				const data = await fetchApiIndex(wpApiUrl);

				// Step 2: Validate API requirements
				validateApiRequirements(data);

				// Step 3: Validate authentication endpoints and extract login URL
				const wcposLoginUrl = validateAuthEndpoints(data);

				// Step 4: Build endpoint URLs
				const apiEndpoints = buildEndpoints(wpApiUrl, wcposLoginUrl);

				setSiteData(data);
				setEndpoints(apiEndpoints);
				setStatus('success');

				discoveryLogger.info(`API discovery completed: ${data.name}`);

				return { siteData: data, endpoints: apiEndpoints };
			} catch (err) {
				const errorMessage =
					err instanceof Error && err.message
						? err.message
						: t('auth.failed_to_discover_api_endpoints');
				setError(errorMessage);
				setStatus('error');
				throw err instanceof Error ? err : new Error(errorMessage);
			}
		},
		[fetchApiIndex, validateApiRequirements, validateAuthEndpoints, buildEndpoints, t]
	);

	return {
		status,
		error,
		siteData,
		endpoints,
		discoverApiEndpoints,
	};
};
