import 'react-native-get-random-values';
import { decode, encode } from 'base-64';
import * as SQLite from 'expo-sqlite';
import HTTPAdapter from 'pouchdb-adapter-http';
import SQLiteAdapterFactory from 'pouchdb-adapter-react-native-sqlite';
import { addPouchPlugin, getRxStoragePouch } from 'rxdb/plugins/pouchdb';

const SQLiteAdapter = SQLiteAdapterFactory(SQLite);

addPouchPlugin(SQLiteAdapter);
addPouchPlugin(HTTPAdapter);

// Polyfill
if (!global.btoa) {
	global.btoa = encode;
}

if (!global.atob) {
	global.atob = decode;
}

const config = {
	storage: getRxStoragePouch('react-native-sqlite', { revs_limit: 1, auto_compaction: true }),
	multiInstance: false,
	ignoreDuplicate: true,
};

export default config;
