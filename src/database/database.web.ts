import { createRxDatabase, addRxPlugin } from 'rxdb';
import idbAdapter from 'pouchdb-adapter-idb';
import schema from './user/app-user-schema.json';

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
		});
	}
	return db;
};

export default getDatabase;
