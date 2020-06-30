import { ObservableResource } from 'observable-hooks';
import { switchMap, tap, map } from 'rxjs/operators';
import schema from './schema.json';

/**
 * App User Model methods
 */
const methods = {
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
};

/**
 * App User Collection methods
 */
const statics = {
	async createNewUser() {
		return this.insert({ id: 'new-0', first_name: 'Default', last_name: 'User' });
	},
};

const createAppUsersCollection = async (db) => {
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
