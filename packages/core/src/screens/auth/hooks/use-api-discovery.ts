import * as React from 'react';

import get from 'lodash/get';
import semver from 'semver';

import useHttpClient from '@wcpos/hooks/use-http-client';
import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';

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
	) => Promise<{ siteData: WpJsonResponse; endpoints: ApiEndpoints } | null>;
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
	// Logger available as 'log'

	/**
	 * Fetch and validate the WordPress REST API index
	 */
	const fetchApiIndex = React.useCallback(
		async (wpApiUrl: string): Promise<WpJsonResponse> => {
			try {
				// Add cache-busting param
				const response = await http.get(wpApiUrl, { params: { wcpos: 1 } });
				const data = get(response, 'data') as WpJsonResponse;

				// Basic validation
				if (!data || typeof data !== 'object') {
					log.error(`Bad API response from ${wpApiUrl}`, {
						showToast: true,
						context: { errorCode: ERROR_CODES.INVALID_RESPONSE_FORMAT, wpApiUrl },
					});
					throw new Error(t('Bad API response', { _tags: 'core' }));
				}

				const namespaces = get(data, 'namespaces');
				if (!namespaces || !Array.isArray(namespaces)) {
					log.error(
						`[${ERROR_CODES.WOOCOMMERCE_API_DISABLED}] WordPress API not found at ${wpApiUrl}`,
						{
							showToast: true,
						}
					);
					throw new Error(t('WordPress API not found', { _tags: 'core' }));
				}

				log.debug(
					`WordPress API discovered: ${data.name} (WC ${data.wc_version}, WCPOS ${data.wcpos_version})`
				);
				return data;
			} catch (error) {
				// If it's already one of our logged errors, re-throw
				if (
					error.message.includes('Bad API response') ||
					error.message.includes('WordPress API not found')
				) {
					throw error;
				}

				// Handle network/connection errors
				log.error(
					`[${ERROR_CODES.CONNECTION_REFUSED}] Failed to connect to ${wpApiUrl}: ${error.message}`,
					{
						showToast: true,
					}
				);
				throw error;
			}
		},
		[http, t]
	);

	/**
	 * Validate required namespaces and versions
	 */
	const validateApiRequirements = React.useCallback(
		(data: WpJsonResponse): void => {
			const namespaces = data.namespaces;
			const wcNamespace = 'wc/v3';
			const wcposNamespace = 'wcpos/v1';

			// Check for WooCommerce API
			if (!namespaces.includes(wcNamespace)) {
				log.error('WooCommerce API not found', {
					showToast: true,
					context: { errorCode: ERROR_CODES.WOOCOMMERCE_API_DISABLED },
				});
				throw new Error(t('WooCommerce API not found', { _tags: 'core' }));
			}

			// Check for WCPOS API
			if (!namespaces.includes(wcposNamespace)) {
				log.error('WooCommerce POS plugin not found', {
					showToast: true,
					context: { errorCode: ERROR_CODES.PLUGIN_NOT_FOUND },
				});
				throw new Error(t('WooCommerce POS API not found', { _tags: 'core' }));
			}

			// Check WCPOS version (should be >= 1.8.0 for proper auth endpoints)
			const wcposVersion = data.wcpos_version || data.wcpos_pro_version;
			if (wcposVersion && !semver.gte(wcposVersion, '1.8.0')) {
				log.warn(`WCPOS version ${wcposVersion} may not support all features (recommend 1.8.0+)`);
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
				log.error('Authentication configuration not found', {
					showToast: true,
					context: { errorCode: ERROR_CODES.INVALID_CONFIGURATION },
				});
				throw new Error(t('Authentication configuration not found', { _tags: 'core' }));
			}

			// Check for WCPOS auth endpoint (required for proper authentication)
			const wcposAuth = auth.wcpos;
			if (!wcposAuth || !wcposAuth.endpoints || !wcposAuth.endpoints.authorization) {
				log.error('WCPOS authentication endpoint not found', {
					showToast: true,
					context: { errorCode: ERROR_CODES.PLUGIN_NOT_FOUND },
				});
				throw new Error(
					t(
						'WCPOS authentication endpoint not found. Please ensure WCPOS plugin is version 1.8.0 or higher',
						{ _tags: 'core' }
					)
				);
			}

			const loginUrl = wcposAuth.endpoints.authorization;
			if (!loginUrl || typeof loginUrl !== 'string') {
				log.error('WCPOS login URL is invalid', {
					showToast: true,
					context: { errorCode: ERROR_CODES.INVALID_URL_FORMAT },
				});
				throw new Error(
					t('WCPOS login URL is invalid. Please ensure WCPOS plugin is properly configured', {
						_tags: 'core',
					})
				);
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
				wcpos_api_url: `${baseUrl}wcpos/v1/`,
				wcpos_login_url: wcposLoginUrl,
			};
		},
		[]
	);

	/**
	 * Main discovery function
	 */
	const discoverApiEndpoints = React.useCallback(
		async (
			wpApiUrl: string
		): Promise<{ siteData: WpJsonResponse; endpoints: ApiEndpoints } | null> => {
			if (!wpApiUrl || wpApiUrl.trim() === '') {
				const errorMsg = t('WordPress API URL is required', { _tags: 'core' });
				log.error(errorMsg, {
					showToast: true,
					context: { errorCode: ERROR_CODES.MISSING_REQUIRED_PARAMETERS },
				});
				setError(errorMsg);
				return null;
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

				log.info(`API discovery completed: ${data.name}`);

				return { siteData: data, endpoints: apiEndpoints };
			} catch (err) {
				const errorMessage =
					err.message || t('Failed to discover API endpoints', { _tags: 'core' });
				setError(errorMessage);
				setStatus('error');
				return null;
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
