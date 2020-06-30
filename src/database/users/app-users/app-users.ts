import { ObservableResource } from 'observable-hooks';
import { switchMap, tap, map } from 'rxjs/operators';
import schema from './schema.json';

type SiteModel = import('../sites/sites').SiteModel;
type AppUserSchema = import('./interface').AppUserSchema;
type AppUserModelMethods = {
	addSite: (url: string) => Promise<SiteModel> | undefined;
};
type AppUserModel = import('rxdb').RxDocument<AppUserSchema, AppUserModelMethods>;
type AppUserCollectionMethods = {
	createNewUser: () => Promise<AppUserModel>;
};
export type AppUsersCollection = import('rxdb').RxCollection<
	AppUserModel,
	AppUserModelMethods,
	AppUserCollectionMethods
>;
type Database = import('../../database').Database;

/**
 * App User Model methods
 */
const methods: AppUserModelMethods = {
	async addSite(url) {
		const trimmedUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (!trimmedUrl) return;
		const newSite = await this.collection.database.collections.sites.upsert({
			id: 'site-0',
			url: trimmedUrl,
		});
		await this.update({ $set: { sites: [newSite.id] } });

		console.log(this);
		// eslint-disable-next-line consistent-return
		return newSite;
	},
};

/**
 * App User Collection methods
 */
const statics: AppUserCollectionMethods = {
	async createNewUser() {
		return this.insert({ id: 'new-0', first_name: 'Default', last_name: 'User' });
	},
};

const createAppUsersCollection = async (db: Database): Promise<AppUsersCollection> => {
	const appUsersCollection = await db.collection({
		name: 'app_users',
		schema,
		methods,
		statics,
		options: {
			foo: 'bar',
		},
	});

	appUsersCollection.postCreate((plainData, rxDocument) => {
		const sitesResource = new ObservableResource(
			rxDocument.sites$.pipe(
				switchMap((siteIds) => rxDocument.collection.database.collections.sites.findByIds(siteIds)),
				map((result) => Array.from(result.values()))
				// tap((result) => {
				// 	console.log(result);
				// })
			)
		);
		Object.defineProperty(rxDocument, 'sitesResource', {
			get: () => sitesResource,
		});
	});

	return appUsersCollection;
};

export default createAppUsersCollection;
