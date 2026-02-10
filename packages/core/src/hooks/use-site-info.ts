import * as React from 'react';

import get from 'lodash/get';

import { useHttpClient } from '@wcpos/hooks/use-http-client';
import { getLogger } from '@wcpos/utils/logger';

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
					await site.incrementalPatch({
						wp_version: data?.wp_version ?? '',
						wc_version: data?.wc_version ?? '',
						wcpos_version: data?.wcpos_version ?? '',
						wcpos_pro_version: data?.wcpos_pro_version ?? '',
						license: data?.license || {},
					});
				}
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				appLogger.error('Failed to fetch site info', {
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

		fetchSiteInfo();
	}, [http, wpApiUrl, siteUrl, site]);

	return { isLoading, error };
};
