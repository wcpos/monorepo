import { Observable } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
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

		const site = await this.collections().sites.insert({ url: cleanUrl });
		await this.update({ $push: { sites: site.localId } }).catch((err) => {
			console.log(err);
			return err;
		});
	},

	/**
	 *
	 */
	async removeSite(this: UserDocument, site: SiteDocument) {
		await site.remove();
		await this.atomicPatch({
			sites: pull(this.sites as any[], site.localId),
		});
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
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
