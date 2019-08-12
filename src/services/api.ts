import axios from 'axios';
import Url from '../lib/url-parse';
import database from '../store';

type Site = typeof import('../store/models/site');
type User = typeof import('../store/models/user');

export type ConnectionEvent = {
	type: string;
	payload: any;
};

class ApiService {
	private http = axios;
	private wc_namespace = 'wc/v3';

	site: Site;

	constructor(site: Site) {
		this.site = site;
	}

	async connect() {
		return this.site
			.updateFromJSON({
				connection_status: { status: 'loading', message: 'connecting' },
			})
			.then(() => !this.site.wp_api_url && this.check_wp())
			.then(() => !this.site.wc_api_url && this.check_wp_api())
			.then(() => this.login())
			.catch(error => {
				if (error.response) {
					// The request was made and the server responded with a status code
					// that falls out of the range of 2xx
					console.log(error.response.data);
					console.log(error.response.status);
					console.log(error.response.headers);
				} else if (error.request) {
					// The request was made but no response was received
					// `error.request` is an instance of XMLHttpRequest in the browser and an instance of
					// http.ClientRequest in node.js
					// CORS or domain not found?
					console.log(error.request);
				} else {
					// Something happened in setting up the request that triggered an Error
					console.log('Error', error.message);
				}
				return this.site.updateFromJSON({
					connection_status: { status: 'error', message: error.message },
				});
			});
	}

	async check_wp() {
		return this.http.head(this.site.url).then(response => {
			// See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
			const link = response.headers && response.headers.link;
			const parsed = Url.parseLinkHeader(link);
			if ('https://api.w.org/' in parsed) {
				const { url } = parsed['https://api.w.org/'];
				return this.site.updateFromJSON({
					wp_api_url: url,
					connection_status: { status: 'loading', message: 'WP API found' },
				});
			} else {
				throw new Error('WP API not found');
			}
		});
	}

	async check_wp_api() {
		return this.http.get(this.site.wp_api_url, { headers: { 'X-WCPOS': '1' } }).then(response => {
			const namespaces = response.data && response.data.namespaces;
			if (namespaces.includes(this.wc_namespace)) {
				const wc_api_auth_url =
					response.data.authentication.wcpos.authorize +
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
					);

				return this.site.updateFromJSON({
					...response.data,
					wc_api_auth_url,
					wc_api_url: this.site.wp_api_url + this.wc_namespace,
					connection_status: { status: 'loading', message: 'WC API found' },
				});
			} else {
				throw new Error('WC API not found');
			}
		});
	}

	async login() {
		return this.site.updateFromJSON({
			connection_status: { status: 'auth', message: 'Login' },
		});
	}

	/**
	 * Check, if user already authorized.
	 */
	// public isAuthorized(): Observable<boolean> {
	// 	// return this.tokenStorage.getAccessToken().pipe(map(token => !!token));
	// }

	// {
	// 	key_id: 3,
	// 	user_id: "123",
	// 	consumer_key:
	// 	"ck_3a5b30b5570a020fa613a7be5cdfc516c21e8371",
	// 	consumer_secret: "cs_a57adc1116df21dac39a0483cd635f2d3becfb6b",
	// 	key_permissions: "read_write"
	// }

	// Basic = Base64 encode ck:cs

	async sync(type: string) {
		return this.http
			.get('https://wcposdev.wpengine.com/wp-json/wc/v3/' + type, {
				auth: {
					username: 'ck_3a5b30b5570a020fa613a7be5cdfc516c21e8371',
					password: 'cs_a57adc1116df21dac39a0483cd635f2d3becfb6b',
				},
				headers: {
					'X-WCPOS': '1',
				},
			})
			.then(response => {
				const batch = response.data.map((json: any) => {
					const collection = database.collections.get('products');
					return collection.prepareCreate((model: Product) => {
						Object.keys(json).forEach((key: string) => {
							switch (key) {
								case 'id':
									model.remote_id = json.id;
									break;
								default:
									// @ts-ignore
									model[key] = json[key];
							}
						});
					});
				});
				return database.action(async () => await database.batch(...batch));
			});
	}
}

export default ApiService;
