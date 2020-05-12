import { Q } from '@nozbe/watermelondb';
import { json } from '@nozbe/watermelondb/decorators';
import { Subject, BehaviorSubject, of } from 'rxjs';
import { tap, map, concatMap, startWith, switchMap, catchError } from 'rxjs/operators';
import Model from '../base';
import wcAuthService from '../../../services/wc-auth';
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
		{ name: 'wp_api_url', type: 'string' },
		{ name: 'wc_api_url', type: 'string' },
		{ name: 'wc_api_auth_url', type: 'string' },
	],
};

/**
 * Site Model
 *
 */
export default class Site extends Model {
	static table = 'sites';
	private _connection_status$ = new BehaviorSubject({
		type: 'connecting',
		message: 'TODO: check connection status after init',
	});
	public readonly connection_status$ = this._connection_status$.asObservable();

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
	@field('wp_api_url') wp_api_url!: string;
	@field('wc_api_url') wc_api_url!: string;
	@field('wc_api_auth_url') wc_api_auth_url!: string;

	/**
	 *
	 */
	async fetchUserByRemoteId(remote_id) {
		const users = await this.users.extend(Q.where('remote_id', remote_id)).fetch();
		return users && users[0];
	}

	/**
	 *
	 */
	get urlWithoutPrefix() {
		return this.url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
	}

	/**
	 *
	 */
	get urlForceHttps() {
		return 'https://' + this.urlWithoutPrefix;
	}

	/**
	 *
	 */
	connect() {
		this._connection_status$.next({
			type: 'connecting',
			message: 'Connecting ...',
		});

		of(this.urlForceHttps)
			.pipe(
				concatMap((url) => wcAuthService.fetchWpApiUrl(url)),
				tap((wp_api_url) => {
					this._connection_status$.next({
						type: 'connecting',
						message: 'Wordpress API Found',
					});
				}),
				concatMap((wp_api_url) => wcAuthService.fetchWcApiUrl(wp_api_url)),
				tap((wc_api_url) => {
					this._connection_status$.next({
						type: 'connecting',
						message: 'WooCommerce API Found',
					});
				}),
				catchError((err) => {
					this._connection_status$.next({
						type: 'error',
						message: err.message,
					});
				})
			)
			.subscribe();
	}
}
