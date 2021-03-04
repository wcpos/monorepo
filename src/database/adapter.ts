import { addRxPlugin } from 'rxdb/plugins/core';
import SQLite from 'react-native-sqlite-2';
import SQLiteAdapterFactory from 'pouchdb-adapter-react-native-sqlite';
import Platform from '../lib/platform';

// @TODO is there  better way to do this
// @ts-ignore
if (Platform.OS !== 'test') {
	const SQLiteAdapter = SQLiteAdapterFactory(SQLite);
	addRxPlugin(SQLiteAdapter);
}
