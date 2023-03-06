import { openDatabase } from 'expo-sqlite';
// import { clone } from 'rxdb';

import log from '@wcpos/utils/src/logger';

// import { wrappedValidateAjvStorage } from '../plugins/validate';
// import { mangoQuerySelectorToSQL } from './mangoQuerySelectorToSQL';
import { getRxStorageSQLite, getSQLiteBasicsExpoSQLite } from './plugins/storage-sqlite';
// import { mangoQuerySortToSQL } from './plugins/storage-sqlite/sqlite-statics';

/**
 * Polyfill for TextEncoder
 * fixes: ReferenceError: Can't find variable: TextEncoder
 */
import 'fast-text-encoding';

// import type { SQLiteQueryWithParams } from './plugins/storage-sqlite';

// expo=sqlite examples use the db.transaction() method
// db.transaction((tx) => {
// 	tx.executeSql(
// 		`select * from items where done = ?;`,
// 		[doneHeading ? 1 : 0],
// 		(_, { rows: { _array } }) => setItems(_array)
// 	);
// });

const storage = getRxStorageSQLite({
	sqliteBasics: getSQLiteBasicsExpoSQLite(openDatabase),
});

/**
 *
 */
const config = {
	storage,
	multiInstance: false,
	ignoreDuplicate: true,
};

export default config;
