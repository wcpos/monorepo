import { ObservableResource } from 'observable-hooks';
import { switchMap, map, tap, concatMap, startWith, catchError } from 'rxjs/operators';
import { Subject, BehaviorSubject, of } from 'rxjs';
import findIndex from 'lodash/findIndex';
import pick from 'lodash/pick';
import schema from './schema.json';

import wcAuthService from '../../services/wc-auth';

type UserSchema = import('./interface').UserSchema;
type UserDocumentMethods = {
	addSite: (url: string) => Promise<string>;
	findSiteIndexById: (id: string) => number;
	removeSiteById: (id: string) => Promise<UserDocument>;
	updateSiteById: (id: string, data: any) => Promise<UserDocument>;
};
type UserDocument = import('rxdb').RxDocument<UserSchema, UserDocumentMethods>;
type UsersCollectionMethods = {
	createNewUser: () => Promise<UserDocument>;
};
export type UsersCollection = import('rxdb').RxCollection<
	UserDocument,
	UserDocumentMethods,
	UsersCollectionMethods
>;
type Database = import('../database').Database;

/**
 * User methods
 */
const methods: UserDocumentMethods = {
	/**
	 *
	 * @param url Url entered by user
	 * @return New site id
	 * @TODO check for existing urls, handle errors
	 */
	async addSite(url = '') {
		const id = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (!id) return;

		// eslint-disable-next-line consistent-return
		return this.update({ $push: { sites: { id, wp_credentials: [] } } })
			.then(() => id)
			.catch((err) => console.log(err));
	},

	/**
	 *
	 * @param id
	 */
	findSiteIndexById(id) {
		return findIndex(this.sites, { id });
	},

	/**
	 *
	 * @param site
	 */
	async removeSiteById(id) {
		const idx = this.findSiteIndexById(id);
		return this.atomicUpdate((user) => {
			user.sites.splice(idx, 1);
			return user;
		});
	},

	/**
	 *
	 * @param siteId
	 * @param data
	 * @TODO - a better way to validate nested data?
	 */
	async updateSiteById(id, data) {
		const idx = this.findSiteIndexById(id);
		const allowed = Object.keys(
			this.collection.schema.normalized.properties.sites.items.properties
		);
		return this.atomicSet(`sites.${idx}`, { ...this.sites[idx], ...pick(data, allowed) });
	},

	/**
	 *
	 * @param site
	 */
	async connectSite(id: string) {
		of(`https://${id}`)
			.pipe(
				concatMap((url) => wcAuthService.fetchWpApiUrl(url)),
				tap((wp_api_url) => {
					this.updateSiteById(id, { wp_api_url });
				}),
				concatMap((wp_api_url) => wcAuthService.fetchWcApiUrl(wp_api_url)),
				tap((data) => {
					this.updateSiteById(id, data);
				}),
				catchError((err) => {
					console.log(err);
				})
			)
			.subscribe();
	},

	/**
	 *
	 * @param id
	 * @param username
	 */
	findWpCredentialsBySiteIdAndUsername(id, username) {
		const idx = this.findSiteIndexById(id);
		return findIndex(this.sites[idx].wp_credentials, { username });
	},

	/**
	 *
	 * @param site
	 * @param wpCredentials
	 * @TODO - use remote id for WP user rather than username?
	 */
	async createOrUpdateWpCredentialsBySiteId(id, wpCredentials) {
		const siteIdx = this.findSiteIndexById(id);
		const wpCredentialsIdx = this.findWpCredentialsBySiteIdAndUsername(id, wpCredentials.username);
		const allowed = Object.keys(
			this.collection.schema.normalized.properties.sites.items.properties.wp_credentials.items
				.properties
		);
		const wp_credentials = pick(wpCredentials, allowed);

		return this.atomicUpdate((user) => {
			if (wpCredentialsIdx === -1) {
				user.sites[siteIdx].wp_credentials = user.sites[siteIdx].wp_credentials || [];
				user.sites[siteIdx].wp_credentials.push(wp_credentials);
			} else {
				user.sites[siteIdx].wp_credentials[wpCredentialsIdx] = {
					...user.sites[siteIdx].wp_credentials[wpCredentialsIdx],
					...wp_credentials,
				};
			}
			return user;
		});
	},

	async getStore(siteId, wpUsername) {},
};

/**
 * User Collection methods
 */
const statics: UsersCollectionMethods = {
	/**
	 *
	 * @param data {} | undefined
	 */
	async createNewUser(data) {
		const userData = data || {};
		if (!userData.id) {
			// get max id and increment
			const maxId = Number(await this.findOne().sort({ id: 'asc' }).exec());
			// @TODO - if maxID = 0, should populate demo user?
			userData.id = String(maxId + 1);
		}
		return this.insert(userData);
	},
};

const createUsersCollection = async (db: Database): Promise<UsersCollection> => {
	const usersCollection = await db.collection({
		name: 'users',
		schema,
		methods,
		statics,
		options: {
			foo: 'bar',
		},
	});

	// usersCollection.postCreate((plainData, rxDocument) => {
	// 	const sitesResource = new ObservableResource(
	// 		rxDocument.sites$.pipe(
	// 			switchMap((siteIds) => {
	// 				return rxDocument.collection.database.collections.sites.findByIds(siteIds || []);
	// 			}),
	// 			map((result) => Array.from(result.values()))
	// 			// tap((result) => {
	// 			// 	console.log(result);
	// 			// })
	// 		)
	// 	);
	// 	Object.defineProperty(rxDocument, 'sitesResource', {
	// 		get: () => sitesResource,
	// 	});
	// });

	return usersCollection;
};

export default createUsersCollection;
