import { Subject, BehaviorSubject, of } from 'rxjs';
import { tap, map, concatMap, startWith, switchMap, catchError } from 'rxjs/operators';
import schema from './schema.json';
import wcAuthService from '../../../services/wc-auth';

type SiteSchema = import('./interface').WordPressSitesSchema;
export type SiteModel = import('rxdb').RxDocument<SiteSchema, unknown>;
export type SitesCollection = import('rxdb').RxCollection<SiteModel, unknown, unknown>;
type Database = import('../../database').Database;

/**
 *
 */
const methods = {
	/**
	 *
	 */
	connect() {
		of(this.urlForceHttps)
			.pipe(
				concatMap((url) => wcAuthService.fetchWpApiUrl(url)),
				tap((wp_api_url) => {
					this.update({ $set: { wp_api_url } });
					// this._connection_status$.next({
					// 	type: 'connecting',
					// 	message: 'Wordpress API Found',
					// });
				}),
				concatMap((wp_api_url) => wcAuthService.fetchWcApiUrl(wp_api_url)),
				tap((data) => {
					const {
						url,
						name,
						description,
						home,
						gmt_offset,
						timezone_string,
						wc_api_url,
						wc_api_auth_url,
					} = data;
					this.update({
						$set: {
							url,
							name,
							description,
							home,
							gmt_offset,
							timezone_string,
							wc_api_url,
							wc_api_auth_url,
						},
					});
					// this._connection_status$.next({
					// 	type: 'login',
					// 	message: 'WooCommerce API Found',
					// });
				}),
				catchError((err) => {
					// this._connection_status$.next({
					// 	type: 'error',
					// 	message: err.message,
					// });
				})
			)
			.subscribe();
	},

	/**
	 *
	 */
	async createOrUpdateWpUser(data) {
		const {
			remote_id,
			username,
			first_name,
			last_name,
			display_name,
			email,
			key_id,
			user_id,
			consumer_key,
			consumer_secret,
			key_permissions,
		} = data;

		const newWpUser = await this.collections().wp_users.upsert({
			id: 'wp-user-0',
			remote_id,
			username,
			first_name,
			last_name,
			display_name,
			email,
			key_id,
			// user_id,
			consumer_key,
			consumer_secret,
			key_permissions,
		});
		await this.update({ $set: { wp_users: [newWpUser.id] } });
	},
};

/**
 *
 */
const createSitesCollection = async (db: Database): Promise<SitesCollection> => {
	const sitesCollection = await db.collection({
		name: 'sites',
		schema,
		methods,
	});

	/**
	 *
	 */
	sitesCollection.postCreate((raw, model) => {
		Object.defineProperties(model, {
			/**
			 *
			 */
			nameOrUrl: {
				get: () => {
					return model.name || model.url;
				},
			},

			/**
			 *
			 */
			urlWithoutPrefix: {
				get: () => {
					return model.url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
				},
			},

			/**
			 *
			 */
			urlForceHttps: {
				get: () => {
					return `https://${model.urlWithoutPrefix}`;
				},
			},
		});
	});

	return sitesCollection;
};

export default createSitesCollection;
