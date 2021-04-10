import { addRxPlugin } from 'rxdb/plugins/core';
import SQLite from 'react-native-sqlite-2';
import SQLiteAdapterFactory from 'pouchdb-adapter-react-native-sqlite';

const SQLiteAdapter = SQLiteAdapterFactory(SQLite);
addRxPlugin(SQLiteAdapter);
addRxPlugin(require('pouchdb-adapter-http'));

export const config = {
	adapter: 'react-native-sqlite',
	multiInstance: false,
	ignoreDuplicate: true, // @TODO - not sure why this is needed for storeDB to load
};
