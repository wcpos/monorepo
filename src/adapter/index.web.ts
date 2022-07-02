import { addPouchPlugin, getRxStoragePouch, PouchDB } from 'rxdb/plugins/pouchdb';
import IDBAdapter from 'pouchdb-adapter-idb';
// import pouchdbDebug from 'pouchdb-debug';

// if (process.env.NODE_ENV === 'development') {
// 	PouchDB.plugin(pouchdbDebug);
// 	PouchDB.debug.enable('*');
// }

addPouchPlugin(IDBAdapter);

const config = {
	storage: getRxStoragePouch('idb', { revs_limit: 1, auto_compaction: true }),
	ignoreDuplicate: process.env.NODE_ENV === 'development',
};

export default config;
