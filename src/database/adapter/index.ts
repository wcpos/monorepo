import { addRxPlugin, createRxDatabase, checkAdapter } from 'rxdb';
import SQLite from 'react-native-sqlite-2';
import SQLiteAdapterFactory from 'pouchdb-adapter-react-native-sqlite';
// import httpAdapter from 'pouchdb-adapter-http';
import collections from 'rxdb-utils/dist/collections';

type Collections = import('../database').Collections;
type Database = import('../database').Database;

const SQLiteAdapter = SQLiteAdapterFactory(SQLite);
const supportedAdapters = [];

addRxPlugin(SQLiteAdapter);
addRxPlugin(collections);

// addRxPlugin(httpAdapter);

(() => {
	// checkAdapter("localstorage").then((val) => {
	//   console.log("RXJS -> Adapter -> localstorage status :", val);
	//   if (val && supportedAdapters.indexOf("localstorage") === -1)
	//     supportedAdapters.push("localstorage");
	// });
	// checkAdapter("idb").then((val) => {
	//   console.log("RXJS -> Adapter -> idb status :", val);
	//   if (val && supportedAdapters.indexOf("idb") === -1)
	//     supportedAdapters.push("idb");
	// });
	// checkAdapter("memory").then((val) => {
	//   console.log("RXJS -> Adapter -> memory status :", val);
	//   if (val && supportedAdapters.indexOf("memory") === -1)
	//     supportedAdapters.push("memory");
	// });
	checkAdapter('react-native-sqlite').then((val) => {
		console.log('RXJS -> Adapter -> sqlite status :', val);
		if (val && supportedAdapters.indexOf('react-native-sqlite') === -1)
			supportedAdapters.push('react-native-sqlite');
	});
})();

const getDatabase = async (name: string): Promise<Database> => {
	const db = await createRxDatabase<Collections>({
		name,
		adapter: 'react-native-sqlite', // the name of your adapter
		multiInstance: false,
	});
	return db;
};

export default getDatabase;
