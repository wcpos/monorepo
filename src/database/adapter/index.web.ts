import { createRxDatabase, addRxPlugin } from 'rxdb';
import idbAdapter from 'pouchdb-adapter-idb';

type Collections = import('../database').Collections;
type Database = import('../database').Database;

addRxPlugin(idbAdapter);

const getDatabase = async (name: string): Promise<Database> => {
	const db = createRxDatabase<Collections>({
		name,
		adapter: 'idb', // the name of your adapter
		ignoreDuplicate: true, // for development?
	});
	return db;
};

export default getDatabase;
