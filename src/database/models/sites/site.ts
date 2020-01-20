import { json } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import WooCommerceService from '../../../services/woocommerce';
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
	],
};

const sanitizeValues = (json: any) => json || {};

/**
 * Site Model
 *
 */
export default class Site extends Model {
	static table = 'sites';
	public connection_status$;

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

	/**
	 *
	 */
	urlWithoutPrefix() {
		return this.url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
	}

	/**
	 *
	 */
	connect() {
		const that = this;
		// debugger;
		// console.log(this.url);
		// console.log(that.url);
		const api = new WooCommerceService(this.url);
		this.connection_status$ = api.status$.subscribe({
			next(x) {
				console.log(x);
				that.database.action(async () => {
					await that.update(x?.payload);
				});
			},
			error(err) {
				console.error('something wrong occurred: ' + err);
			},
			complete() {
				console.log('done');
			},
		});
	}
}
