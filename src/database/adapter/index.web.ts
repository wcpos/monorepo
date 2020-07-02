import { createRxDatabase, addRxPlugin } from 'rxdb';
import idbAdapter from 'pouchdb-adapter-idb';
import collections from 'rxdb-utils/dist/collections';

type Collections = import('../database').Collections;
type Database = import('../database').Database;

addRxPlugin(idbAdapter);
addRxPlugin(collections);

const getDatabase = async (name: string): Promise<Database> => {
	const db = createRxDatabase<Collections>({
		name,
		adapter: 'idb', // the name of your adapter
		ignoreDuplicate: true, // for development?
	});
	return db;
};

export default getDatabase;
