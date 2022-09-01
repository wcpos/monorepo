import * as React from 'react';
import get from 'lodash/get';
import find from 'lodash/find';
import useHttpClient from '@wcpos/hooks/src/use-http-client';
import Platform from '@wcpos/core/src/lib/platform';
import useAuth from '@wcpos/hooks/src/use-auth';
import Url from '@wcpos/core/src/lib/url-parse';

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

					const parsed = Url.parseLinkHeader(link);
					const wpApiUrl = get(parsed, ['https://api.w.org/', 'url']);

					if (wpApiUrl) {
						const wcNamespace = 'wc/v3';
						const wcposNamespace = 'wcpos/v1';

						return http.get(wpApiUrl).then((res) => {
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
					console.error(err);
				});
				site = find(sites, { url: siteData?.url });

				// if not existingSite, then insert site data
				if (!site) {
					site = await userDB.sites.insert(siteData);

					user.update({ $push: { sites: site?.localID } }).catch((err) => {
						console.log(err);
						return err;
					});
				}

				setLoading(false);
			}

			return site;
		},
		[user, userDB]
	);

	return { onConnect, loading, error };
};

export default useSiteConnect;
