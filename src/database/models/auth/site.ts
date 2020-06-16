import { Q } from '@nozbe/watermelondb';
import { action, field, children, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Subject, BehaviorSubject, of } from 'rxjs';
import { tap, map, concatMap, startWith, switchMap, catchError } from 'rxjs/operators';
import Model from '../base';
import wcAuthService from '../../../services/wc-auth';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const TABLE_NAME = 'sites';

/**
 * Site Schema
 *
 */
export const siteSchema: Schema = {
	name: TABLE_NAME,
	columns: [
		{ name: 'app_user_id', type: 'string', isIndexed: true },
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
 */
export default class Site extends Model {
	static table = TABLE_NAME;
	private _connection_status$ = new BehaviorSubject({
		type: 'connecting',
		message: 'TODO: check connection status after init',
	});

	public readonly connection_status$ = this._connection_status$.asObservable();

	static associations = {
		app_users: { type: 'belongs_to', key: 'app_user_id' },
		wp_users: { type: 'has_many', foreignKey: 'site_id' },
		stores: { type: 'has_many', foreignKey: 'site_id' },
	};

	@immutableRelation('app_users', 'app_user_id') user!: any;

	@children('wp_users') wp_users!: any;
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
	async fetchWpUserByRemoteId(remote_id) {
		const wpUsers = await this.wp_users.extend(Q.where('remote_id', remote_id)).fetch();
		return wpUsers && wpUsers[0];
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
		return `https://${this.urlWithoutPrefix}`;
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
					this.updateWithJson({ wp_api_url });
					this._connection_status$.next({
						type: 'connecting',
						message: 'Wordpress API Found',
					});
				}),
				concatMap((wp_api_url) => wcAuthService.fetchWcApiUrl(wp_api_url)),
				tap((data) => {
					this.updateWithJson(data);
					this._connection_status$.next({
						type: 'login',
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

	/**
	 *
	 * @param data
	 */
	async createOrUpdateUser(data) {
		let wpUser = await this.fetchWpUserByRemoteId(data?.remote_id);
		if (!wpUser) {
			wpUser = await this.createNewWpUser(data);
		} else {
			wpUser.updateWithJson(data);
		}
	}

	/**
	 *
	 */
	@action createNewWpUser(data) {
		return this.wp_users.collection.create((wp_user) => {
			wp_user.set(data);
			wp_user.site.set(this);
		});
	}
}
