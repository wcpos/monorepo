import { createRxDatabase, addRxPlugin } from 'rxdb';
import idbAdapter from 'pouchdb-adapter-idb';

addRxPlugin(idbAdapter);

const getDatabase = async (name: string) => {
	const db = createRxDatabase({
		name,
		adapter: 'idb', // the name of your adapter
		ignoreDuplicate: true, // for development?
	});
	return db;
};
export default getDatabase;
