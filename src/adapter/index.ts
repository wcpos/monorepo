import { openDatabase, WebSQLDatabase, ResultSet } from 'expo-sqlite';
import { getRxStorageSQLite } from './plugins/sqlite';

/**
 * Polyfill for TextEncoder
 * fixes: ReferenceError: Can't find variable: TextEncoder
 */
import 'fast-text-encoding';

import type { SQLiteQueryWithParams } from './plugins/sqlite';

/**
 *
 */
const getSQLiteBasicsExpoSQLite = (openDB: typeof openDatabase) => {
	return {
		open: async (name: string) => {
			return Promise.resolve(openDB(name));
		},
		all: async (db: WebSQLDatabase, queryWithParams: SQLiteQueryWithParams) => {
			const result = new Promise<ResultSet['rows']>((resolve, reject) => {
				console.log(`all sql: ${queryWithParams.query}`, queryWithParams.params);
				db.exec(
					[{ sql: queryWithParams.query, args: queryWithParams.params }],
					false,
					(err, res) => {
						console.log('sql response: ', res);

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
			console.log(`run sql: ${queryWithParams.query}`, queryWithParams.params);
			db.exec([{ sql: queryWithParams.query, args: queryWithParams.params }], false, () => {});
		},
		close: async (db: WebSQLDatabase) => {
			return db.closeAsync();
		},
		journalMode: '',
	};
};

/**
 *
 */

/**
 *
 */
const config = {
	storage: getRxStorageSQLite({
		/**
		 * Different runtimes have different interfaces to SQLite.
		 * For example in node.js we have a callback API,
		 * while in capacitor sqlite we have Promises.
		 * So we need a helper object that is capable of doing the basic
		 * sqlite operations.
		 */
		sqliteBasics: getSQLiteBasicsExpoSQLite(openDatabase),
	}),
	multiInstance: false,
	ignoreDuplicate: true,
};

export default config;
