import * as React from 'react';

import find from 'lodash/find';
import get from 'lodash/get';

import useHttpClient from '@wcpos/hooks/src/use-http-client';
import log from '@wcpos/utils/src/logger';

import useAuth from '../../contexts/auth';
import { parseLinkHeader } from '../../lib/url';

type SiteDocument = import('@wcpos/database/src').SiteDocument;

interface WpJsonResponse {
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
	const { user, userDB } = useAuth();
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState(false);
	const http = useHttpClient();

	const onConnect = React.useCallback(
		async (url: string): Promise<SiteDocument> => {
			setLoading(true);
			let site;

			// first get siteData
			const protocol = 'https';
			// if (Platform.OS === 'web' && process.env.NODE_ENV === 'development') {
			// 	protocol = 'https';
			// }

			const urlWithoutProtocol = url.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';

			const siteData = await http
				.head(`${protocol}://${urlWithoutProtocol}`)
				.then((response) => {
					const link = get(response, ['headers', 'link']);
					if (!link) {
						/**
						 * @TODO
						 *
						 * For CORS requests only a few headers are allowed by default.
						 *  Access-Control-Expose-Headers: Link is needed on the server side to get the link header
						 */
						throw Error('Link is not exposed');
					}

					const parsed = parseLinkHeader(link);
					const wpApiUrl = get(parsed, ['https://api.w.org/', 'url']);

					if (wpApiUrl) {
						const wcNamespace = 'wc/v3';
						const wcposNamespace = 'wcpos/v1';

						// hack - add param to break cache
						return http.get(wpApiUrl, { params: { wcpos: 1 } }).then((res) => {
							const data = get(res, 'data') as WpJsonResponse;
							const namespaces = get(data, 'namespaces');
							if (!namespaces) {
								throw Error('WordPress API not found');
							}
							if (!namespaces.includes(wcNamespace)) {
								throw Error('WooCommerce API not found');
							}
							if (!namespaces.includes(wcposNamespace)) {
								throw Error('WooCommerce POS API not found');
							}
							return {
								...data,
								wp_api_url: wpApiUrl,
								wc_api_url: `${wpApiUrl}wc/v3`,
								wc_api_auth_url: `${wpApiUrl}wcpos/v1/jwt`,
							};
						});
					}
					throw Error('Site does not seem to be a WordPress site');
				})
				.catch((err) => {
					setError(err.message);
					setLoading(false);
				});

			if (siteData) {
				// check against database
				// populate user sites
				const sites = await user.populate('sites').catch((err) => {
					log.error(err);
				});
				site = find(sites, { url: siteData?.url });

				// if not existingSite, then insert site data
				if (!site) {
					site = await userDB.sites.insert(siteData);

					user.update({ $push: { sites: site?.localID } }).catch((err) => {
						log.log(err);
						return err;
					});
				}

				setLoading(false);
			}

			return site;
		},
		[http, user, userDB.sites]
	);

	return { onConnect, loading, error };
};

export default useSiteConnect;
