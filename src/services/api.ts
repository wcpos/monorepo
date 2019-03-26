import axios from 'axios';
import Url from '../lib/url-parse';

type Site = typeof import('../store/models/site');

export type ConnectionEvent = {
	type: string;
	payload: any;
};

class ApiService {
	private http = axios;
	private wc_namespace = 'wc/v3';
	private wc_auth = '/wc-auth/v1/authorize';

	site: Site;

	constructor(site: Site) {
		this.site = site;
	}

	async connect() {
		return this.check_wp()
			.then(() => this.check_wp_api())
			.catch(error => {
				console.log(error);
			});
	}

	async check_wp() {
		return this.http.head(this.site.url).then(response => {
			// See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
			const link = response.headers && response.headers.link;
			const parsed = Url.parseLinkHeader(link);
			if ('https://api.w.org/' in parsed) {
				const { url } = parsed['https://api.w.org/'];
				return this.site.updateFromJSON({ wp_api_url: url });
			} else {
				throw new Error('WP API not found');
			}
		});
	}

	async check_wp_api() {
		return this.http.get(this.site.wp_api_url).then(response => {
			return this.site.updateFromJSON(response.data);
			// const namespaces = response.data && response.data.namespaces;
			// if (namespaces.includes('wc/v3')) {
			// set WooCommerce API Url
			// this.wc_api_url = new Url(this.wp_api_url);
			// this.wc_api_url.set('pathname', this.wc_api_url.pathname + 'wc/v3');
			// // set WooCommerce Auth Url
			// this.wc_api_auth_url = this.site.url + '/wc-auth/v1/authorize';
			// this.connection$.next({ wc_api_url: this.wc_api_url.href });

			// console.log(response.data);
			// debugger;
			// // this.wc_api_auth_url = this.site.url + '/wc-auth/v1/authorize';
			// return this.login();
			// } else {
			// 	throw new Error('WC API not found');
			// }
		});
	}

	// login() {
	// 	this.connection$.next({
	// 		type: 'wcpos_api/FETCH',
	// 		payload:
	// 			this.site.wc_api_auth_url +
	// 			Url.qs.stringify(
	// 				{
	// 					app_name: 'WooCommerce POS',
	// 					scope: 'read_write',
	// 					user_id: 123,
	// 					return_url: 'https://client.wcpos.com/auth',
	// 					callback_url: 'https://client.wcpos.com/auth',
	// 				},
	// 				true
	// 			),
	// 	});
	// }

	/**
	 * Check, if user already authorized.
	 */
	// public isAuthorized(): Observable<boolean> {
	// 	// return this.tokenStorage.getAccessToken().pipe(map(token => !!token));
	// }
}

export default ApiService;
