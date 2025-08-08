import * as React from 'react';

import get from 'lodash/get';

import useHttpClient from '@wcpos/hooks/use-http-client';
import log from '@wcpos/utils/logger';

interface Props {
	site: import('@wcpos/database').SiteDocument;
}

/**
 * Hook to fetch and update site information
 */
export const useSiteInfo = ({ site }: Props) => {
	const http = useHttpClient();

	React.useEffect(() => {
		const fetchSiteInfo = async () => {
			try {
				const response = await http.get(site.wp_api_url, { params: { wcpos: 1 } });

				// Check if response is successful
				if (!response || response.status < 200 || response.status >= 300) {
					log.error('Failed to fetch site info: Invalid response status', {
						context: {
							status: response?.status,
							statusText: response?.statusText,
							siteUrl: site.url,
						},
					});
					return;
				}

				const data = get(response, 'data', {});

				// Check if data exists and has expected structure
				if (!data || typeof data !== 'object') {
					log.debug('Site info response contains no valid data', {
						context: { siteUrl: site.url, hasData: !!data },
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
					site.incrementalPatch({
						wp_version: data?.wp_version,
						wc_version: data?.wc_version,
						wcpos_version: data?.wcpos_version,
						wcpos_pro_version: data?.wcpos_pro_version,
						license: data?.license || {},
					});
				}
			} catch (error) {
				log.error('Failed to fetch site info', {
					context: {
						error: error instanceof Error ? error.message : String(error),
						siteUrl: site.url,
					},
				});
			}
		};

		fetchSiteInfo();
	}, [http, site]);
};
