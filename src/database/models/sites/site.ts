import { Q } from '@nozbe/watermelondb';
import { json } from '@nozbe/watermelondb/decorators';
import get from 'lodash/get';
import Model from '../base';
import WooCommerceService from '../../../services/woocommerce';
import Url from '../../../lib/url-parse';
import http from '../../../lib/http';
import { map } from 'rxjs/operators';
import { field, children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Site Schema
 *
 */
export const siteSchema: Schema = {
	name: 'sites',
	columns: [
		{ name: 'name', type: 'string' },
		{ name: 'description', type: 'string' },
		{ name: 'url', type: 'string' },
		{ name: 'home', type: 'string' },
		{ name: 'gmt_offset', type: 'string' },
		{ name: 'timezone_string', type: 'string' },
		{ name: 'namespaces', type: 'string' },
		{ name: 'authentication', type: 'string' },
		{ name: 'routes', type: 'string' },
		{ name: 'wp_api_url', type: 'string' },
		{ name: 'wc_api_url', type: 'string' },
		{ name: 'wc_api_auth_url', type: 'string' },
		{ name: 'connection_status', type: 'string' },
	],
};

const sanitizeValues = (json: any) => json || {};

/**
 * Site Model
 *
 */
export default class Site extends Model {
	static table = 'sites';
	private wc_namespace = 'wc/v3';
	// api: ApiService;

	constructor(collection, raw) {
		super(collection, raw);
	}

	static associations = {
		users: { type: 'has_many', foreignKey: 'site_id' },
		stores: { type: 'has_many', foreignKey: 'site_id' },
	};

	@children('users') users!: any;
	@children('stores') stores!: any;

	@field('name') name!: string;
	@field('description') description!: string;
	@field('url') url!: string;
	@field('home') home!: string;
	@field('gmt_offset') gmt_offset!: string;
	@field('timezone_string') timezone_string!: string;
	@json('namespaces', sanitizeValues) namespaces!: {};
	@json('authentication', sanitizeValues) authentication!: {};
	@json('routes', sanitizeValues) routes!: {};
	@field('wp_api_url') wp_api_url!: string;
	@field('wc_api_url') wc_api_url!: string;
	@field('wc_api_auth_url') wc_api_auth_url!: string;
	@json('connection_status', sanitizeValues) connection_status!: string;

	/**
	 *
	 * @param prefix
	 */
	getUrl(prefix = 'https://') {
		const url = this.asModel._getRaw('url');
		return prefix + url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		// return prefix + url;
	}

	/**
	 *
	 */
	get wcAuthUrl() {
		return (
			this.authentication.wcpos.authorize +
			Url.qs.stringify(
				{
					app_name: 'WooCommerce POS',
					scope: 'read_write',
					user_id: 123,
					return_url: 'https://localhost:3000/auth',
					callback_url: 'https://client.wcpos.com',
					wcpos: 1,
				},
				true
			)
		);
	}

	/**
	 *
	 */
	connect() {
		const api = new WooCommerceService(this.url);
		api.status$.subscribe({
			next(x) {
				console.log('got value ' + JSON.stringify(x));
			},
			error(err) {
				console.error('something wrong occurred: ' + err);
			},
			complete() {
				console.log('done');
			},
		});
	}

	/**
	 *
	 */
	async getWpApiUrl() {
		return http.head('https://' + this.url + '/').then(response => {
			// See https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
			const link = get(response, ['headers', 'link']);
			const parsed = Url.parseLinkHeader(link);
			if ('https://api.w.org/' in parsed) {
				const { url } = parsed['https://api.w.org/'];
				return this.updateFromJSON({
					wp_api_url: url,
					connection_status: { status: 'loading', message: 'WordPress API found' },
				});
			} else {
				return this.updateFromJSON({
					connection_status: { status: 'error', message: 'WordPress API not found' },
				});
			}
		});
	}

	/**
	 *
	 */
	async getWcApiUrl() {
		return http.get(this.wp_api_url).then(response => {
			const namespaces = get(response, ['data', 'namespaces']);
			if (namespaces.includes(this.wc_namespace)) {
				const wc_api_auth_url = get(response, ['data', 'authentication', 'wcpos', 'authorize']);
				if (wc_api_auth_url) {
					return this.updateFromJSON({
						...response.data,
						wc_api_auth_url,
						wc_api_url: this.wp_api_url + this.wc_namespace,
						connection_status: { status: 'success', message: 'WooCommerce API found' },
					});
				} else {
					return this.updateFromJSON({
						connection_status: { status: 'error', message: 'WooCommerce POS not found' },
					});
				}
			} else {
				return this.updateFromJSON({
					connection_status: { status: 'error', message: 'WooCommerce API not found' },
				});
			}
		});
	}
}
