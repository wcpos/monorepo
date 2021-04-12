import { ObservableResource } from 'observable-hooks';
import { switchMap, map, tap, concatMap, startWith, catchError, filter } from 'rxjs/operators';
import { Subject, BehaviorSubject, of } from 'rxjs';
import findIndex from 'lodash/findIndex';
import pick from 'lodash/pick';
import getDatabase from '../adapter';
import createCollectionMap from '../collections/stores';
import { generateId } from '../../utils';
import wcAuthService from '../../services/wc-auth';
import initialUI from './ui-initial.json';

type UserDocument = import('../types').UserDocument;

/**
 * User methods
 */
export default {
	/**
	 *
	 * @param url Url entered by user
	 * @return New site id
	 * @TODO check for existing urls, handle errors
	 */
	async addSite(this: UserDocument, url = '') {
		const id = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (!id) return;

		// eslint-disable-next-line consistent-return
		return this.update({ $push: { sites: { id, wp_credentials: [] } } })
			.then(() => id)
			.catch((err) => {
				console.log(err);
				return err;
			});
	},

	/**
	 *
	 * @param id
	 */
	findSiteIndexById(this: UserDocument, id = '') {
		return findIndex(this.sites, { id });
	},

	/**
	 *
	 * @param site
	 */
	async removeSiteById(this: UserDocument, id = '') {
		const idx = this.findSiteIndexById(id);
		return this.atomicUpdate((user) => {
			user?.sites?.splice(idx, 1);
			return user;
		});
	},

	/**
	 *
	 * @param siteId
	 * @param data
	 * @TODO - fix this
	 */
	async updateSiteById(this: UserDocument, id = '', data = {}) {
		const idx = this.findSiteIndexById(id);
		debugger;
		// const allowed = Object.keys(
		// 	this?.collection?.schema?.normalized?.properties?.sites?.items?.properties
		// );
		// return this.atomicSet(`sites.${idx}`, { ...this.sites[idx], ...pick(data, allowed) });
		// return this.atomicPatch(`sites.${idx}`, { ...this.sites[idx], ...data });
	},

	/**
	 *
	 * @param site
	 */
	async connectSite(this: UserDocument, id = '') {
		of(`https://${id}`)
			.pipe(
				concatMap((url) => wcAuthService.fetchWpApiUrl(url)),
				tap((wp_api_url) => {
					this.updateSiteById(id, { wp_api_url });
				}),
				filter((wp_api_url) => wp_api_url),
				concatMap((wp_api_url) => wcAuthService.fetchWcApiUrl(wp_api_url)),
				tap((data) => {
					this.updateSiteById(id, data);
				}),
				catchError((err) => {
					console.log(err);
					return err;
				})
			)
			.subscribe();
	},

	/**
	 *
	 * @param id
	 * @param username
	 */
	findWpCredentialsBySiteIdAndUsername(this: UserDocument, id = '', username = '') {
		const idx = this.findSiteIndexById(id);
		debugger;
		// return findIndex(this?.sites?[idx]?.wp_credentials, { username });
	},

	/**
	 *
	 * @param site
	 * @param wpCredentials
	 * @TODO - use remote id for WP user rather than username?
	 */
	async createOrUpdateWpCredentialsBySiteId(
		this: UserDocument,
		id = '',
		wpCredentials: { username: string; stores: { id: string; name: string }[] }
	) {
		const siteIdx = this.findSiteIndexById(id);
		const wpCredentialsIdx = this.findWpCredentialsBySiteIdAndUsername(id, wpCredentials.username);
		// const allowed = Object.keys(
		// 	this?.collection?.schema?.normalized?.properties?.sites.items?.properties?.wp_credentials
		// 		?.items?.properties
		// );
		const allowed = [''];
		const wp_credentials = pick(wpCredentials, allowed);

		// generate random id and add default store
		// @TODO - how to handle this with multiple stores?
		// maybe stores should be separated into their own table? then checked against custom wcpos api
		wp_credentials.stores = [{ id: generateId(), name: 'Default Store' }];

		return this.atomicUpdate((user) => {
			debugger;
			// if (wpCredentialsIdx === -1) {
			// 	user?.sites?[siteIdx].wp_credentials = user.sites[siteIdx].wp_credentials || [];
			// 	user?.sites?[siteIdx].wp_credentials.push(wp_credentials);
			// } else {
			// 	user?.sites?[siteIdx].wp_credentials[wpCredentialsIdx] = {
			// 		...user.sites[siteIdx].wp_credentials[wpCredentialsIdx],
			// 		...wp_credentials,
			// 	};
			// }
			return user;
		});
	},

	/**
	 *
	 * @param name
	 */
	async getStoreDB(name: string) {
		// init store database
		const storeDatabase = getDatabase(name).then((db) =>
			Promise.all(
				// @ts-ignore
				createCollectionMap.map((createCollection) => {
					// @ts-ignore
					return createCollection(db);
				})
			)
				// .then(() =>
				// 	Promise.all([
				// 		db.upsertLocal('pos_products', initialUI.pos_products),
				// 		db.upsertLocal('pos_cart', initialUI.pos_cart),
				// 		db.upsertLocal('products', initialUI.products),
				// 		db.upsertLocal('orders', initialUI.orders),
				// 		db.upsertLocal('customers', initialUI.customers),
				// 	])
				// )
				.then(() =>
					Promise.all([
						db
							.getLocal('pos_products')
							.then((ui) => ui || db.upsertLocal('pos_products', initialUI.pos_products))
							.then((ui) => ui),
						db
							.getLocal('pos_cart')
							.then((ui) => ui || db.upsertLocal('pos_cart', initialUI.pos_cart))
							.then((ui) => ui),
						db
							.getLocal('products')
							.then((ui) => ui || db.upsertLocal('products', initialUI.products))
							.then((ui) => ui),
						db
							.getLocal('orders')
							.then((ui) => ui || db.upsertLocal('orders', initialUI.orders))
							.then((ui) => ui),
						db
							.getLocal('customers')
							.then((ui) => ui || db.upsertLocal('customers', initialUI.customers))
							.then((ui) => ui),
					])
				)
				.then((uiArray) => {
					// @ts-ignore
					db.ui = {};
					uiArray.forEach((ui) => {
						db.ui[ui.id] = ui;
					});
					// @ts-ignore
					db.getUI = (section) => {
						return db.ui[section];
					};
					return db;
				})
		);

		return storeDatabase;
	},

	/**
	 *
	 */
	getWpCredentialsByStoreId(id = '') {},
};
