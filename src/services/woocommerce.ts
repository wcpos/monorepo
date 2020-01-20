import { of, Observable, throwError } from 'rxjs';
import { tap, map, concatMap, startWith } from 'rxjs/operators';
import http from '../lib/http';
import Url from '../lib/url-parse';

/**
 * Handles connection to WooCommerce API
 */
class WooCommerceService {
	private http = http;
	private wc_namespace = 'wc/v3';

	public status$;
	public subscriber;

	constructor(url) {
		this.status$ = new Observable(subscriber => {
			this.subscriber = subscriber;
			of(url)
				.pipe(
					tap(url => {
						subscriber.next({ message: 'Connecting to ' + url });
					}),
					concatMap(url => this.fetchWpApiUrl(url)),
					tap(wp_api_url => {
						subscriber.next({
							message: 'Found WordPress API',
							payload: {
								wp_api_url,
							},
						});
					}),
					concatMap(wp_api_url => this.fetchWcApiInfo(wp_api_url)),
					tap(data => {
						subscriber.next({
							message: 'Found WooCommerce API',
							payload: data,
						});
					})
				)
				.subscribe();
		});
	}

	/**
	 * Fetch WordPress API URL
	 * @param wpUrl WordPress homepage (or store page)
	 */
	async fetchWpApiUrl(wpUrl) {
		return this.http
			.head(wpUrl)
			.then(response => {
				// See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
				const link = response?.headers?.link;
				const parsed = Url.parseLinkHeader(link);
				const url = parsed?.['https://api.w.org/']?.url;
				if (url) {
					return url;
				} else {
					this.subscriber.error('WP API not found');
				}
			})
			.catch(err => {
				this.subscriber.error(err);
			});
	}

	/**
	 * Fetch WordPress API URL
	 * @param wpUrl WordPress homepage (or store page)
	 */
	async fetchWcApiInfo(wpApiUrl) {
		return this.http.get(wpApiUrl).then(response => {
			const namespaces = response?.data?.namespaces;
			if (namespaces.includes(this.wc_namespace)) {
				const baseAuthUrl = response?.data?.authentication?.wcpos?.authorize;
				if (baseAuthUrl) {
					return {
						...response.data,
						wc_api_url: wpApiUrl + this.wc_namespace,
						wc_api_auth_url: this.constructWcApiAuthUrl(baseAuthUrl),
					};
				} else {
					this.subscriber.error('WC POS plugin not found');
				}
			} else {
				this.subscriber.error('WC API not found');
			}
		});
	}

	/**
	 *
	 * @param baseURL
	 */
	constructWcApiAuthUrl(baseAuthUrl) {
		return (
			baseAuthUrl +
			Url.qs.stringify(
				{
					app_name: 'WooCommerce POS',
					scope: 'read_write',
					user_id: 123,
					return_url: 'https://localhost:3000/auth',
					callback_url: 'https://client.wcpos.com',
					wcpos: 1,
					// return_url: 'https://client.wcpos.com/auth',
					// callback_url: 'https://client.wcpos.com/auth',
				},
				true
			)
		);
	}
}

export default WooCommerceService;
