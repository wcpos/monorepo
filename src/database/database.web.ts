import { createRxDatabase, addRxPlugin } from 'rxdb';
import idbAdapter from 'pouchdb-adapter-idb';
import { ObservableResource } from 'observable-hooks';
import { switchMap, tap, map } from 'rxjs/operators';
import schema from './users/app-users/schema.json';
import sitesSchema from './users/sites/schema.json';

type WordPressSiteSchema = import('./users/sites/interface').WordPressSitesSchema;
type AppUserSchema = import('./users/app-users/interface').AppUserSchema;
type AppUserMethods = {};

type SiteDocument = import('rxdb').RxDocument<WordPressSiteSchema, {}>;
type RxDatabase = import('rxdb').RxDatabase;
type RxCollection = import('rxdb').RxCollection;

const docMethods = {
	async addSite(url) {
		const trimmedUrl = url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
		if (trimmedUrl) {
			const newSite = await this.collection.database.collections.sites.upsert({
				id: 'site-0',
				url: trimmedUrl,
			});
			await this.update({ $set: { sites: [newSite.id] } });
			console.log(this);
		}
	},
	getSitesResource(): ObservableResource<SiteDocument[]> {
		return new ObservableResource(this.sites$);
	},
};

const colMethods = {
	async createNewUser() {
		return this.insert({ id: 'new-0', first_name: 'Default', last_name: 'User' });
	},
};

type AppUserCollection = import('rxdb').RxCollection<
	AppUserSchema,
	typeof docMethods,
	typeof colMethods
>;

addRxPlugin(idbAdapter);

const getDatabase = async (
	name: string
): Promise<RxDatabase<{ app_users: RxCollection<AppUserSchema, {}, {}> }>> => {
	const db = await createRxDatabase({
		name,
		adapter: 'idb', // the name of your adapter
		ignoreDuplicate: true, // for development?
	});
	if (name === 'wcpos_users') {
		const appUsersCollection = await db.collection({
			name: 'app_users',
			schema,
			methods: docMethods,
			statics: colMethods,
			options: {
				foo: 'bar',
			},
		});
		appUsersCollection.postCreate(function (plainData, rxDocument) {
			Object.defineProperty(rxDocument, 'sitesResource', {
				get: () => {
					return new ObservableResource(
						rxDocument.sites$.pipe(
							switchMap((siteIds) =>
								rxDocument.collection.database.collections.sites.findByIds(siteIds)
							),
							// map((result) => result.value),
							tap((result) => {
								console.log(result);
							})
						)
					);
				},
			});
		});

		const sitesCollection = await db.collection({
			name: 'sites',
			schema: sitesSchema,
		});
		sitesCollection.postCreate(function (plainData, rxDocument) {
			debugger;
			Object.defineProperty(rxDocument, 'nameOrUrl', {
				get: () => {
					debugger;
					return rxDocument.name || rxDocument.url;
				},
			});
			Object.defineProperty(rxDocument, 'urlWithoutPrefix', {
				get: () => {
					debugger;
					return 'foo';
				},
			});
		});
	}
	return db;
};

export default getDatabase;
