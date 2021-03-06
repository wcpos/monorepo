import isString from 'lodash/isString';
import get from 'lodash/get';
import schema from './schema.json';

export type UserSchema = import('./interface').UserSchema;
export type UserDocument = import('rxdb').RxDocument<UserSchema, UserMethods>;
export type UserCollection = import('rxdb').RxCollection<UserDocument, UserMethods, UserStatics>;
type UserMethods = Record<string, never>;
type UserStatics = Record<string, never>;

type SiteCollection = import('../sites').SiteCollection;
type SiteDocument = import('../sites').SiteDocument;

interface Methods {
	addSite: (url: string) => Promise<SiteDocument | undefined>;
}

const methods: Methods = {
	/** */
	async addSite(this: UserDocument, url) {
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
