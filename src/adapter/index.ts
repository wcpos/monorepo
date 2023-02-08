import { openDatabase, WebSQLDatabase, ResultSet } from 'expo-sqlite';
// import { clone } from 'rxdb';

import log from '@wcpos/utils/src/logger';

// import { wrappedValidateAjvStorage } from '../plugins/validate';
// import { mangoQuerySelectorToSQL } from './mangoQuerySelectorToSQL';
import { getRxStorageSQLite } from './plugins/storage-sqlite';
// import { mangoQuerySortToSQL } from './plugins/storage-sqlite/sqlite-statics';

/**
 * Polyfill for TextEncoder
 * fixes: ReferenceError: Can't find variable: TextEncoder
 */
import 'fast-text-encoding';

// import type { SQLiteQueryWithParams } from './plugins/storage-sqlite';
type SQLiteQueryWithParams = any;

// expo=sqlite examples use the db.transaction() method
// db.transaction((tx) => {
// 	tx.executeSql(
// 		`select * from items where done = ?;`,
// 		[doneHeading ? 1 : 0],
// 		(_, { rows: { _array } }) => setItems(_array)
// 	);
// });

/**
 *
 */
const getSQLiteBasicsExpoSQLite = (openDB: typeof openDatabase) => {
	return {
		open: async (name: string) => {
			return Promise.resolve(openDB(name));
		},
		all: async (db: WebSQLDatabase, queryWithParams: SQLiteQueryWithParams) => {
			log.debug(`all sql: ${queryWithParams.query}`, queryWithParams.params);
			const result = new Promise<ResultSet['rows']>((resolve, reject) => {
				db.exec(
					[{ sql: queryWithParams.query, args: queryWithParams.params }],
					false,
					(err, res) => {
						log.silly('sql response: ', res);

						if (err) {
							return reject(err);
						}

						if (Array.isArray(res)) {
							const queryResult = res[0]; // there is only one query
							if (Object.prototype.hasOwnProperty.call(queryResult, 'rows')) {
								return resolve(queryResult.rows);
							}
							return reject(queryResult.error);
						}

						return reject(new Error(`Unexpected response from SQLite: ${res}`));
					}
				);
			});
			return result;
		},
		run: async (db: WebSQLDatabase, queryWithParams: SQLiteQueryWithParams) => {
			log.debug(`run sql: ${queryWithParams.query}`, queryWithParams.params);
			db.exec([{ sql: queryWithParams.query, args: queryWithParams.params }], false, (err, res) => {
				if (err) {
					log.error('sql error: ', err);
				}
			});
		},
		close: async (db: WebSQLDatabase) => {
			return db.closeAsync();
		},
		journalMode: 'WAL',
	};
};

// const storage = wrappedValidateAjvStorage({
// 	storage: getRxStorageSQLite({
// 		/**
// 		 * Different runtimes have different interfaces to SQLite.
// 		 * For example in node.js we have a callback API,
// 		 * while in capacitor sqlite we have Promises.
// 		 * So we need a helper object that is capable of doing the basic
// 		 * sqlite operations.
// 		 */
// 		sqliteBasics: getSQLiteBasicsExpoSQLite(openDatabase),
// 	}),
// });

const storage = getRxStorageSQLite({
	/**
	 * Different runtimes have different interfaces to SQLite.
	 * For example in node.js we have a callback API,
	 * while in capacitor sqlite we have Promises.
	 * So we need a helper object that is capable of doing the basic
	 * sqlite operations.
	 */
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

/**
 * Duck punch the prepareQuery function to implement our own mango-to-sqlite query converter.
 */
// config.storage.statics.prepareQuery = (r, t) => {
// 	const a = t.limit ? `LIMIT ${t.limit}` : 'LIMIT -1';
// 	const n = t.skip ? `OFFSET ${t.skip}` : '';
// 	const o = [];
// 	let s = mangoQuerySelectorToSQL(t.selector, o);
// 	s = s !== '()' ? ` AND ${s} ` : '';
// 	let c = '';
// 	t.index && (c = `INDEXED BY "${u(t.index)}"`);
// 	return {
// 		schema: r,
// 		mangoQuery: clone(t),
// 		sqlQuery: {
// 			query: `${c} WHERE deleted=0 ${s}${mangoQuerySortToSQL(t.sort)} ${a} ${n} ;`,
// 			params: o,
// 		},
// 	};
// };

export default config;
