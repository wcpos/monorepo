import { createRxDatabase, addRxPlugin } from 'rxdb';
import idbAdapter from 'pouchdb-adapter-idb';
import schema from './user/app-user-schema.json';
import sitesSchema from './user/sites-schema.json';

type AppUser = {
	id: string;
	first_name: string;
	last_name: string;
	display_name: string;
	sites: [];
};

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
};

const colMethods = {
	async createNewUser() {
		return this.insert({ id: 'new-0', first_name: 'Default', last_name: 'User' });
	},
};

type AppUserCollection = import('rxdb').RxCollection<AppUser, typeof docMethods, typeof colMethods>;

addRxPlugin(idbAdapter);

const getDatabase = async (name: string) => {
	const db = await createRxDatabase({
		name,
		adapter: 'idb', // the name of your adapter
		ignoreDuplicate: true, // for development?
	});
	if (name === 'wcpos_users') {
		await db.collection({
			name: 'app_users',
			schema,
			methods: docMethods,
			statics: colMethods,
			options: {
				foo: 'bar',
			},
		});
		await db.collection({
			name: 'sites',
			schema: sitesSchema,
		});
	}
	return db;
};

export default getDatabase;
