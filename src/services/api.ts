import axios from 'axios';
import { Subject, Observable, from } from 'rxjs';
// import { tap, map, switchMap, catchError } from 'rxjs/operators';
import { Site } from '../models';
import Url from '../lib/url-parse';

type AxiosResponse = import('axios').AxiosResponse;

export type ActionTypes =
	| 'wp_api/FETCH'
	| 'wp_api/SUCCESS'
	| 'wp_api/ERROR'
	| 'wc_api/FETCH'
	| 'wc_api/SUCCESS'
	| 'wc_api/ERROR'
	| 'wcpos_api/FETCH'
	| 'wcpos_api/SUCCESS'
	| 'wcpos_api/ERROR';

export type ConnectionEvent = {
	type: string;
	payload: any;
};

class ApiService {
	private http = axios;
	connection$ = new Subject();
	site: any;
	user: any;

	constructor(site: typeof Site | string, user?: any) {
		this.site = typeof site === 'string' ? new Site(site) : site;
		this.user = user;
	}

	connect() {
		return this.check_wp().catch(() => this.connection$.complete());
	}

	check_wp() {
		this.connection$.next({ type: 'wp_api/FETCH' });
		return this.http
			.head(this.site.url)
			.then(response => {
				// See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
				console.log(response);
				const link = response.headers && response.headers.link;
				const parsed = Url.parseLinkHeader(link);
				if ('https://api.w.org/' in parsed) {
					const { url } = parsed['https://api.w.org/'];
					this.site.wp_api_url = url;
					this.connection$.next({
						type: 'wp_api/SUCCESS',
						payload: { message: 'found ' + this.site.wp_api_url },
					});
					return this.check_wp_api();
				} else {
					throw new Error('WP API nout found');
				}
			})
			.catch(error => {
				this.connection$.error({ type: 'wp_api/ERROR', payload: { error } });
			});
	}

	check_wp_api() {
		this.connection$.next({
			type: 'wc_api/FETCH',
			payload: { message: 'checking ' + this.site.wp_api_url },
		});
		return this.http
			.get(this.site.wp_api_url)
			.then(response => {
				console.log(response);
				const namespaces = response.data && response.data.namespaces;
				if (namespaces.includes('wc/v3')) {
					this.site.wc_api_url = this.site.wp_api_url + 'wc/v3';
					this.connection$.next({
						type: 'wc_api/SUCCESS',
						payload: { message: 'found ' + this.site.wc_api_url },
					});
					console.log(response.data.authentication);
					// store auth url
					this.site.wc_api_auth_url = this.site.url + '/wc-auth/v1/authorize';
					return this.login();
				} else {
					throw new Error('WC API not found');
				}
			})
			.catch(error => {
				this.connection$.error({ type: 'wc_api/ERROR', payload: { error } });
			});
	}

	login() {
		this.connection$.next({
			type: 'wcpos_api/FETCH',
			payload:
				this.site.wc_api_auth_url +
				Url.qs.stringify(
					{
						app_name: 'WooCommerce POS',
						scope: 'read_write',
						user_id: 123,
						return_url: 'wcpos://auth',
						callback_url: 'https://auth',
					},
					true
				),
		});
	}
	/**
	 * Check, if user already authorized.
	 */
	// public isAuthorized(): Observable<boolean> {
	// 	// return this.tokenStorage.getAccessToken().pipe(map(token => !!token));
	// }
}

export default ApiService;
