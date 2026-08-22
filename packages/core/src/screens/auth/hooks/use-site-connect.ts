import * as React from 'react';

import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';
import { deriveSyntheticPathBase, deriveSyntheticPathRoot } from '@wcpos/utils/rest-transport';

import { useAppState } from '../../../contexts/app-state';
import {
	runConnectCompatibilityProbes,
	testAuthorizationMethod,
} from '../../../contexts/app-state/hydration-steps';
import { useT } from '../../../contexts/translations';
import { upsertSiteData } from '../../../utils/site-writes';
import { useApiDiscovery } from './use-api-discovery';
import { useUrlDiscovery } from './use-url-discovery';

const siteLogger = getLogger(['wcpos', 'auth', 'site']);

type SiteDocument = import('@wcpos/database').SiteDocument;

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

interface ExtendedSiteData extends WpJsonResponse {
	wp_api_url: string;
	wc_api_url: string;
	wcpos_api_url: string;
	wcpos_login_url: string;
	use_jwt_as_param: boolean;
	use_rest_route_param: boolean;
}

export type SiteConnectStatus =
	'idle' | 'discovering-url' | 'discovering-api' | 'testing-auth' | 'saving' | 'success' | 'error';

export interface SiteConnectProgress {
	step: number;
	totalSteps: number;
	message: string;
}

interface UseSiteConnectReturn {
	status: SiteConnectStatus;
	progress: SiteConnectProgress | null;
	error: string | null;
	errorCode: ErrorCode | null;
	loading: boolean;
	onConnect: (url: string) => Promise<SiteDocument | null>;
	reset: () => void;
}

/**
 * Main hook for connecting to a WooCommerce site
 * Orchestrates URL discovery, API discovery, and authorization testing
 */
export const useSiteConnect = (): UseSiteConnectReturn => {
	const { user, userDB } = useAppState();
	const [status, setStatus] = React.useState<SiteConnectStatus>('idle');
	const [progress, setProgress] = React.useState<SiteConnectProgress | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [errorCode, setErrorCode] = React.useState<ErrorCode | null>(null);
	const t = useT();

	// Individual discovery hooks
	const urlDiscovery = useUrlDiscovery();
	const apiDiscovery = useApiDiscovery();

	const loading = status !== 'idle' && status !== 'success' && status !== 'error';

	/**
	 * Update progress information
	 */
	const updateProgress = React.useCallback((step: number, message: string) => {
		setProgress({
			step,
			totalSteps: 4,
			message,
		});
	}, []);

	/**
	 * Reset all state
	 */
	const reset = React.useCallback(() => {
		setStatus('idle');
		setProgress(null);
		setError(null);
		setErrorCode(null);
	}, []);

	/**
	 * Save site data to database
	 */
	const saveSiteData = React.useCallback(
		async (
			siteData: WpJsonResponse,
			endpoints: any,
			authResult: any
		): Promise<SiteDocument | null> => {
			try {
				// Combine all the data into the extended site data format
				const extendedSiteData: ExtendedSiteData = {
					...siteData,
					...endpoints,
					use_jwt_as_param: authResult.useJwtAsParam,
					use_rest_route_param: authResult.useRestRouteParam,
				};

				// Parse and validate the data using the database schema
				const parsedData = (userDB.sites as any).parseRestResponse(extendedSiteData);

				// Check if site already exists
				const existingSite = await (userDB.sites as any).findOneFix(siteData.uuid).exec();

				/**
				 * Merge the discovered details into the site document.
				 *
				 * This must not be a full-document write: `parsedData` carries the schema
				 * default for every property the REST index does not return, including the
				 * locally-owned `wp_credentials` link array. Writing that back erased any
				 * credential linked while discovery was still in flight (#902).
				 */
				const siteDoc = await upsertSiteData(userDB.sites, parsedData);

				// Ensure site is in user's sites array (may be missing if new or previously removed)
				const currentSites: string[] = user.getLatest().sites ?? [];
				if (!currentSites.includes(siteData.uuid)) {
					await user.getLatest().incrementalUpdate({ $push: { sites: siteData.uuid } });
					siteLogger.debug(
						existingSite
							? `Re-added site to user: ${siteData.name}`
							: `Added new site: ${siteData.name}`
					);
				}

				if (existingSite) {
					siteLogger.debug(`Updated site: ${siteData.name}`);
				}

				return siteDoc.getLatest();
			} catch (err: unknown) {
				// Determine error type and code
				let errorCode: ErrorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED; // Default for DB operations

				if (err instanceof Error && err.name === 'ValidationError') {
					errorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
				} else if (err instanceof Error && err.name === 'RxError') {
					// Check for specific RxDB error codes
					switch ((err as Error & { code?: string }).code) {
						case 'RX1':
							errorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
							break;
						case 'RX2':
							errorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
							break;
						case 'RX3':
							errorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
							break;
						default:
							errorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
					}
				}

				const errMessage = getErrorMessage(err);
				siteLogger.error(`Failed to save site data: ${errMessage}`, {
					code: errorCode,
					showToast: true,
					context: {
						error: errMessage,
					},
				});

				throw new Error(t('auth.failed_to_save_site_data'));
			}
		},
		[user, userDB.sites, t]
	);

	/**
	 * Main connection function
	 */
	const onConnect = React.useCallback(
		async (url: string): Promise<SiteDocument | null> => {
			setErrorCode(null);
			if (!url || url.trim() === '') {
				const errorMsg = t('auth.url_is_required');
				siteLogger.error(errorMsg, {
					showToast: true,
					code: ERROR_CODES.STORE_URL_INVALID,
				});
				setError(errorMsg);
				return null;
			}

			setStatus('discovering-url');
			setError(null);
			setProgress(null);

			try {
				// Step 1: Discover WordPress API URL
				updateProgress(1, t('auth.discovering_wordpress_api'));
				setStatus('discovering-url');

				const wpApiUrl = await urlDiscovery.discoverWpApiUrl(url);

				// Step 2: Discover and validate API endpoints
				updateProgress(2, t('auth.validating_api_endpoints'));
				setStatus('discovering-api');

				const apiResult = await apiDiscovery.discoverApiEndpoints(wpApiUrl);

				// Step 3: Test authorization methods
				updateProgress(3, t('auth.testing_authorization_methods'));
				setStatus('testing-auth');

				const authResult = await testAuthorizationMethod(
					apiResult.endpoints.wcpos_api_url,
					'mock.connect.test',
					apiResult.siteData.wcpos_version,
					wpApiUrl
				);
				if (!authResult.ok) {
					if (authResult.code) {
						// Inline copy is translated; the registry summary stays the
						// docs/logs voice. Codes without a dedicated key share the
						// generic host line — the DocsLink names the exact cause.
						const messageKey =
							authResult.code === ERROR_CODES.AUTH_TOKEN_BLOCKED_BY_HOST
								? 'auth.server_blocks_login_token'
								: authResult.code === ERROR_CODES.REST_TRANSPORT_BLOCKED
									? 'auth.store_rest_api_unreachable'
									: 'auth.host_compatibility_problem';
						throw Object.assign(new Error(t(messageKey)), {
							errorCode: authResult.code,
						});
					}
					throw new Error(t('auth.failed_to_test_authorization_methods'));
				}
				const compatibility = await runConnectCompatibilityProbes({
					pathBase: deriveSyntheticPathBase(apiResult.endpoints.wcpos_api_url),
					pathRoot: deriveSyntheticPathRoot(wpApiUrl),
					useRestRouteParam: authResult.useRestRouteParam,
				});
				if (compatibility.blocking) {
					throw Object.assign(new Error(t('auth.host_compatibility_problem')), {
						errorCode: compatibility.blocking,
					});
				}

				// Step 4: Save to database
				updateProgress(4, t('auth.saving_site_configuration'));
				setStatus('saving');

				const savedSite = await saveSiteData(apiResult.siteData, apiResult.endpoints, authResult);
				if (!savedSite) {
					throw new Error(t('auth.failed_to_save_site_configuration'));
				}

				setStatus('success');
				setProgress({
					step: 4,
					totalSteps: 4,
					message: t('auth.site_connected_successfully'),
				});

				siteLogger.info(`Site connected: ${savedSite.name}`);

				return savedSite;
			} catch (err) {
				const errorMessage =
					err instanceof Error && err.message ? err.message : t('auth.failed_to_connect_to_site');
				setError(errorMessage);
				setErrorCode(
					err instanceof Error
						? ((err as Error & { errorCode?: ErrorCode }).errorCode ?? null)
						: null
				);
				setStatus('error');
				return null;
			}
		},
		[urlDiscovery, apiDiscovery, saveSiteData, updateProgress, t]
	);

	return {
		status,
		progress,
		error,
		errorCode,
		loading,
		onConnect,
		reset,
	};
};
