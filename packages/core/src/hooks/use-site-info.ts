import * as React from 'react';

import get from 'lodash/get';

import { isAsleepBlock, requestStateManager, useHttpClient } from '@wcpos/hooks/use-http-client';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

const appLogger = getLogger(['wcpos', 'app', 'site']);

interface Props {
	site: import('@wcpos/database').SiteDocument;
}

interface SiteInfoResult {
	isLoading: boolean;
	error: string | null;
}

/**
 * Hook to fetch and update site information.
 * Fetches WP/WC/WCPOS version info from the site's REST API and updates the local site document.
 */
export const useSiteInfo = ({ site }: Props): SiteInfoResult => {
	const http = useHttpClient();
	const [isLoading, setIsLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	// Use stable values to prevent unnecessary re-fetches
	const wpApiUrl = site.wp_api_url;
	const siteUrl = site.url;

	// A fetch blocked while the tab was hidden is deferred, not failed: waking bumps
	// this tick, which re-runs the effect below.
	const [wakeTick, setWakeTick] = React.useState(0);
	React.useEffect(() => requestStateManager.onWake(() => setWakeTick((tick) => tick + 1)), []);

	/**
	 * Fetch site info on mount and when site URL changes.
	 * This is a legitimate useEffect for fetching external data on mount.
	 */
	React.useEffect(() => {
		const fetchSiteInfo = async () => {
			if (!wpApiUrl) {
				return;
			}

			setIsLoading(true);
			setError(null);

			try {
				const response = await http.get(wpApiUrl, { params: { wcpos: 1 } });

				// Check if response is successful
				if (!response || response.status < 200 || response.status >= 300) {
					const errorMsg = `Invalid response status: ${response?.status}`;
					appLogger.error('Failed to fetch site info: Invalid response status', {
						code: ERROR_CODES.SYNC_UNEXPECTED,
						context: {
							status: response?.status,
							statusText: response?.statusText,
							siteUrl,
						},
					});
					setError(errorMsg);
					return;
				}

				const data = get(response, 'data', {});

				// Check if data exists and has expected structure
				if (!data || typeof data !== 'object') {
					appLogger.debug('Site info response contains no valid data', {
						context: { siteUrl, hasData: !!data },
					});
					return;
				}

				// Only patch if we have at least one valid field to update
				const hasValidData =
					data.wp_version ||
					data.wc_version ||
					data.wcpos_version ||
					data.wcpos_pro_version ||
					data.license;
				if (hasValidData) {
					const patch: Record<string, unknown> = {
						wp_version: data?.wp_version ?? '',
						wc_version: data?.wc_version ?? '',
						wcpos_version: data?.wcpos_version ?? '',
						wcpos_pro_version: data?.wcpos_pro_version ?? '',
					};
					if (data.license !== undefined) patch.license = data.license || {};
					await site.incrementalPatch(patch);
				}
			} catch (err) {
				if (isAsleepBlock(err)) {
					// Nothing was attempted, so nothing failed: leave `error` unset and
					// wait for the wake tick below to re-run the fetch. Reporting this
					// would mark a backgrounded tab as broken, and `wcpos_version` — the
					// value the plugin-compat gate reads — would stay stale for the whole
					// session because this effect only fires on mount.
					appLogger.debug('Site info fetch deferred — app is in background', {
						context: { siteUrl },
					});
					return;
				}
				const errorMsg = getErrorMessage(err);
				appLogger.error('Failed to fetch site info', {
					code: ERROR_CODES.SYNC_UNEXPECTED,
					context: {
						error: errorMsg,
						siteUrl,
					},
				});
				setError(errorMsg);
			} finally {
				setIsLoading(false);
			}
		};

		void fetchSiteInfo();
	}, [http, wpApiUrl, siteUrl, site, wakeTick]);

	return { isLoading, error };
};
