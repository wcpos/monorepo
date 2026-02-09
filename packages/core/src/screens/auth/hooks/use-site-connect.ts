import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/error-codes';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useApiDiscovery } from './use-api-discovery';
import { useAuthTesting } from './use-auth-testing';
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
}

export type SiteConnectStatus =
	| 'idle'
	| 'discovering-url'
	| 'discovering-api'
	| 'testing-auth'
	| 'saving'
	| 'success'
	| 'error';

export interface SiteConnectProgress {
	step: number;
	totalSteps: number;
	message: string;
}

interface UseSiteConnectReturn {
	status: SiteConnectStatus;
	progress: SiteConnectProgress | null;
	error: string | null;
	loading: boolean;
	onConnect: (url: string) => Promise<SiteDocument | null>;
	reset: () => void;
}

/**
 * Main hook for connecting to a WooCommerce site
 * Orchestrates URL discovery, API discovery, and authorization testing
 */
const useSiteConnect = (): UseSiteConnectReturn => {
	const { user, userDB } = useAppState();
	const [status, setStatus] = React.useState<SiteConnectStatus>('idle');
	const [progress, setProgress] = React.useState<SiteConnectProgress | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const t = useT();

	// Individual discovery hooks
	const urlDiscovery = useUrlDiscovery();
	const apiDiscovery = useApiDiscovery();
	const authTesting = useAuthTesting();

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
				};

				// Parse and validate the data using the database schema
				const parsedData = (userDB.sites as any).parseRestResponse(extendedSiteData);

				// Check if site already exists
				const existingSite = await (userDB.sites as any).findOneFix(siteData.uuid).exec();

				if (existingSite) {
					// Update existing site
					await existingSite.incrementalPatch(parsedData);
					siteLogger.debug(`Updated site: ${siteData.name}`);
					return existingSite.getLatest();
				} else {
					// Add new site to user's sites list
					await user.incrementalUpdate({ $push: { sites: parsedData } });
					const newSite = await (userDB.sites as any).findOneFix(siteData.uuid).exec();
					siteLogger.debug(`Added new site: ${siteData.name}`);
					return newSite;
				}
			} catch (err: unknown) {
				// Determine error type and code
				let errorCode: ErrorCode = ERROR_CODES.TRANSACTION_FAILED; // Default for DB operations

				if (err instanceof Error && err.name === 'ValidationError') {
					errorCode = ERROR_CODES.CONSTRAINT_VIOLATION;
				} else if (err instanceof Error && err.name === 'RxError') {
					// Check for specific RxDB error codes
					switch ((err as Error & { code?: string }).code) {
						case 'RX1':
							errorCode = ERROR_CODES.DUPLICATE_RECORD;
							break;
						case 'RX2':
							errorCode = ERROR_CODES.CONSTRAINT_VIOLATION;
							break;
						case 'RX3':
							errorCode = ERROR_CODES.INVALID_DATA_TYPE;
							break;
						default:
							errorCode = ERROR_CODES.TRANSACTION_FAILED;
					}
				}

				const errMessage = err instanceof Error ? err.message : String(err);
				siteLogger.error(`Failed to save site data: ${errMessage}`, {
					showToast: true,
					context: {
						errorCode,
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
			if (!url || url.trim() === '') {
				const errorMsg = t('auth.url_is_required');
				siteLogger.error(errorMsg, {
					showToast: true,
					context: { errorCode: ERROR_CODES.MISSING_REQUIRED_PARAMETERS },
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
				if (!wpApiUrl) {
					throw new Error(urlDiscovery.error || t('auth.failed_to_discover_wordpress_api'));
				}

				// Step 2: Discover and validate API endpoints
				updateProgress(2, t('auth.validating_api_endpoints'));
				setStatus('discovering-api');

				const apiResult = await apiDiscovery.discoverApiEndpoints(wpApiUrl);
				if (!apiResult) {
					throw new Error(apiDiscovery.error || t('auth.failed_to_discover_api_endpoints'));
				}

				// Step 3: Test authorization methods
				updateProgress(3, t('auth.testing_authorization_methods'));
				setStatus('testing-auth');

				const authResult = await authTesting.testAuthorizationMethod(
					apiResult.endpoints.wcpos_api_url
				);
				if (!authResult) {
					throw new Error(authTesting.error || t('auth.failed_to_test_authorization_methods'));
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
				setStatus('error');
				return null;
			}
		},
		[urlDiscovery, apiDiscovery, authTesting, saveSiteData, updateProgress, t]
	);

	return {
		status,
		progress,
		error,
		loading,
		onConnect,
		reset,
	};
};

export default useSiteConnect;
