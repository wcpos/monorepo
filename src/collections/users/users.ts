import { Observable } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import isString from 'lodash/isString';
import get from 'lodash/get';
import pull from 'lodash/pull';
import schema from './schema.json';

export type UserSchema = import('./interface').UserSchema;
export type UserDocument = import('rxdb').RxDocument<UserSchema, UserMethods>;
export type UserCollection = import('rxdb').RxCollection<UserDocument, UserMethods, UserStatics>;
type UserStatics = Record<string, never>;

type SiteCollection = import('../sites').SiteCollection;
type SiteDocument = import('../sites').SiteDocument;

interface UserMethods {
	addSiteByUrl: (url: string) => Promise<void>;
	addSite: (data: any) => Promise<SiteDocument>;
	removeSite: (site: SiteDocument) => Promise<void>;
	getSites$: () => Observable<SiteDocument[]>;
}

const methods: UserMethods = {
	/**
	 *
	 */
	async addSiteByUrl(this: UserDocument, url) {
		const cleanUrl = isString(url) && url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (!cleanUrl) return;

		const site = await this.collection.database.collections.sites.insert({ url: cleanUrl });
		await this.update({ $push: { sites: site.localID } }).catch((err) => {
			console.log(err);
			return err;
		});
	},

	/**
	 *
	 * @param this
	 * @param data
	 */
	async addSite(this: UserDocument, data: any) {
		const site = await this.collection.database.collections.sites.insert(data);
		await this.update({ $push: { sites: site.localID } }).catch((err) => {
			console.log(err);
			return err;
		});

		return site;
	},

	/**
	 * @TODO - $pull is not implemented yet, PR to RxDB?
	 */
	async removeSite(this: UserDocument, site: SiteDocument) {
		// await this.update({ $pull: { sites: site.localID } });
		await this.atomicUpdate((oldData) => {
			oldData.sites = pull(oldData.sites || [], site.localID);
			return oldData;
		});
		await site.remove();
	},

	/**
	 *
	 */
	getSites$(this: UserDocument) {
		return this.sites$.pipe(
			switchMap(async (args: any) => {
				const sites = await this.populate('sites');
				return sites || [];
			})
		);
	},
};

export const users = {
	schema,
	// pouchSettings: {},
	// statics: {},
	methods,
	// attachments: {},
	options: {
		middlewares: {
			postCreate: {
				handle: (data, user) => {
					const populatedSites$ = user.sites$.pipe(
						switchMap(async (args: any) => {
							const sites = await user.populate('sites');
							return sites || [];
						})
					);
					Object.assign(user, {
						populatedSites$,
						sitesResource: new ObservableResource(populatedSites$),
					});
				},
				parallel: false,
			},
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
	// localDocuments: true,
};
