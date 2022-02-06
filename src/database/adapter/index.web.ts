import { addPouchPlugin, getRxStoragePouch } from 'rxdb';
import IDBAdapter from 'pouchdb-adapter-idb';

addPouchPlugin(IDBAdapter);

const config = {
	storage: getRxStoragePouch('idb', { revs_limit: 1, auto_compaction: true }),
	ignoreDuplicate: process.env.NODE_ENV === 'development',
};

export default config;
