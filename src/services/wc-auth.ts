import { Observable, from, of } from 'rxjs';
import { tap, map, concatMap, startWith, switchMap, catchError } from 'rxjs/operators';
import http from '../lib/http';
import Url from '../lib/url-parse';

const namespace = 'wc/v3';

/**
 * Parse WP Rest Api URL from HTTP response
 * See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
 * @param response HTTP response
 */
const getWpApiUrlFromHeadResponse = (response) => {
	const link = response?.headers?.link;
	const parsed = Url.parseLinkHeader(link);
	return parsed?.['https://api.w.org/']?.url;
};

/**
 * Fetch WordPress API URL
 * @param url WordPress URL
 */
const fetchWpApiUrl = (url: string) => from(http.head(url)).pipe(map(getWpApiUrlFromHeadResponse));

/**
 * Fetch WooCommerce API URL
 * @param url WordPress API URL
 */
const fetchWcApiUrl = (url: string) =>
	from(http.get(url)).pipe(
		map((response) => {
			const namespaces = response?.data?.namespaces;
			if (namespaces.includes(namespace)) {
				const baseAuthUrl = response?.data?.authentication?.wcpos?.authorize;
				if (baseAuthUrl) {
					return {
						...response.data,
						wc_api_url: url + namespace,
						wc_api_auth_url: baseAuthUrl,
					};
				}
			}
		})
	);

export const testables = { fetchWpApiUrl, getWpApiUrlFromHeadResponse, fetchWcApiUrl };

export default {};
