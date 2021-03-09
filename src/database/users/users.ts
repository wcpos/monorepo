import { Observable } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import isString from 'lodash/isString';
import get from 'lodash/get';
import pull from 'lodash/pull';
import schema from './schema.json';

export type UserSchema = import('./interface').UserSchema;
export type UserDocument = import('rxdb').RxDocument<UserSchema, UserMethods>;
export type UserCollection = import('rxdb').RxCollection<UserDocument, UserMethods, UserStatics>;
type UserMethods = Record<string, never>;
type UserStatics = Record<string, never>;

type SiteCollection = import('../sites').SiteCollection;
type SiteDocument = import('../sites').SiteDocument;

interface Methods {
	addSiteByUrl: (url: string) => Promise<SiteDocument | undefined>;
	removeSite: (site: SiteDocument) => Promise<void>;
	getSites_$: () => Observable<SiteDocument[]>;
}

const methods: Methods = {
	/**
	 *
	 */
	async addSiteByUrl(this: UserDocument, url) {
		const cleanUrl = isString(url) && url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (cleanUrl) {
			const sitesCollection: SiteCollection = get(this, 'collection.database.collections.sites');

			if (sitesCollection) {
				// @ts-ignore
				const site = await sitesCollection.insert({ url: cleanUrl });
				await this.update({ $push: { sites: site.localId } }).catch((err) => {
					console.log(err);
					return err;
				});

				return site;
			}
		}
		return undefined;
	},

	/**
	 *
	 */
	async removeSite(this: UserDocument, site: SiteDocument) {
		await site.remove();
		await this.atomicPatch({
			sites: pull(this.sites as any[], site.id),
		});
	},

	/**
	 *
	 */
	getSites_$(this: UserDocument) {
		const sitesCollection: SiteCollection = get(this, 'collection.database.collections.sites');

		// @ts-ignore
		return this.sites$.pipe(
			switchMap((ids: string[]) => sitesCollection.findByIds(ids || [])),
			map((sitesMap: Map<string, SiteDocument>) => Array.from(sitesMap.values()))
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
