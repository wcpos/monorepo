import { Observable, from, of } from 'rxjs';
import { tap, map, concatMap, startWith, switchMap, catchError } from 'rxjs/operators';
import http from '../lib/http';
import Url from '../lib/url-parse';

const namespace = 'wc/v3';

/**
 * Parse WP Rest Api URL from HTTP headers
 * See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
 * @param response HTTP response
 */
const parseApiUrlFromHeaders = (headers: { link: string }) => {
	const link = headers?.link;
	const parsed = Url.parseLinkHeader(link);
	return parsed?.['https://api.w.org/']?.url;
};

/**
 * Fetch WordPress API URL
 * @param url WordPress URL
 */
const fetchWpApiUrl = (url: string) =>
	from(http.head(url)).pipe(
		map((response) => {
			return parseApiUrlFromHeaders(response?.headers);
		})
	);

/**
 * Fetch WooCommerce API URL
 * @param url WordPress API URL
 */
const fetchWcApiUrl = (url: string) =>
	from(http.get(url)).pipe(
		map((response) => {
			const namespaces = response?.data?.namespaces;
			if (namespaces && namespaces.includes(namespace)) {
				const baseAuthUrl = response?.data?.authentication?.wcpos?.authorize;
				if (baseAuthUrl) {
					return {
						...response.data,
						wc_api_url: `${url + namespace}/`, // enforce trailing slash
						wc_api_auth_url: baseAuthUrl,
					};
				}
			}
		})
	);

export default { fetchWpApiUrl, parseApiUrlFromHeaders, fetchWcApiUrl };
