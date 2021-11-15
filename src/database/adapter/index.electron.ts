import { addPouchPlugin, getRxStoragePouch } from 'rxdb/plugins/pouchdb';
import IDBAdapter from 'pouchdb-adapter-idb';

addPouchPlugin(IDBAdapter);

const config = {
	storage: getRxStoragePouch('idb', { revs_limit: 1, auto_compaction: true }),
	ignoreDuplicate: false,
};

export default config;
