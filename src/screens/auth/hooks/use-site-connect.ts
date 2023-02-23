import * as React from 'react';

import find from 'lodash/find';
import get from 'lodash/get';

import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';
import { parseLinkHeader } from '../../../lib/url';

type SiteDocument = import('@wcpos/database/src').SiteDocument;

interface WpJsonResponse {
	uuid: string;
	authentication: Record<string, unknown>;
	description: string;
	gmt_offset: string;
	home: string;
	name: string;
	namespaces: string[];
	routes: Record<string, unknown>;
	site_logo: string;
	timezone_string: string;
	url: string;
	_links: Record<string, unknown>;
}

const useSiteConnect = () => {
	const { user, userDB } = useLocalData();
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState(false);
	const http = useHttpClient();

	/**
	 *
	 */
	const getSiteData = React.useCallback(
		async (wpApiUrl: string): Promise<WpJsonResponse> => {
			const wcNamespace = 'wc/v3';
			const wcposNamespace = 'wcpos/v1';

			// hack - add param to break cache
			const response = await http.get(wpApiUrl, { params: { wcpos: 1 } });
			const data = get(response, 'data') as WpJsonResponse;
			const namespaces = get(data, 'namespaces');
			if (!namespaces) {
				throw Error(t('WordPress API not found', { _tags: 'core' }));
			}
			if (!namespaces.includes(wcNamespace)) {
				throw Error(t('WooCommerce API not found', { _tags: 'core' }));
			}
			if (!namespaces.includes(wcposNamespace)) {
				throw Error(t('WooCommerce POS API not found', { _tags: 'core' }));
			}
			return {
				...data,
				wp_api_url: wpApiUrl,
				wc_api_url: `${wpApiUrl}wc/v3`,
				wc_api_auth_url: `${wpApiUrl}wcpos/v1/jwt`,
			};
		},
		[http]
	);

	/**
	 *
	 */
	const getWPAPIUrl = React.useCallback(
		async (url: string) => {
			const protocol = 'https';
			// if (Platform.OS === 'web' && process.env.NODE_ENV === 'development') {
			// 	protocol = 'https';
			// }
			const urlWithoutProtocol = url.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
			const response = await http.head(`${protocol}://${urlWithoutProtocol}`);
			const link = get(response, ['headers', 'link']);
			if (!link) {
				/**
				 * TODO
				 *
				 * For CORS requests only a few headers are allowed by default.
				 *  Access-Control-Expose-Headers: Link is needed on the server side to get the link header
				 */
				throw Error(t('Link header is not exposed', { _tags: 'core' }));
			}

			// Parse the link header
			const parsed = parseLinkHeader(link);
			return get(parsed, ['https://api.w.org/', 'url']);
		},
		[http]
	);

	/**
	 *
	 */
	const onConnect = React.useCallback(
		async (url: string): Promise<SiteDocument | undefined> => {
			if (url === '') return;
			setLoading(true);

			try {
				const wpApiUrl = await getWPAPIUrl(url);
				if (!wpApiUrl) {
					throw Error(t('Site does not seem to be a WordPress site', { _tags: 'core' }));
				}

				const siteData = await getSiteData(wpApiUrl);
				await user.incrementalUpdate({ $push: { sites: siteData } });
				return await userDB.sites.findOneFix(siteData.uuid).exec();
			} catch (err) {
				setError(err.message);
			} finally {
				setLoading(false);
			}
		},
		[getSiteData, getWPAPIUrl, user, userDB.sites]
	);

	return { onConnect, loading, error };
};

export default useSiteConnect;
