import { resourceDir } from '@tauri-apps/api/path';
import Database from 'tauri-plugin-sql-api';

import { getRxStorageSQLite, getSQLiteBasicsNode } from './plugins/storage-sqlite';

const sqliteBasics = getSQLiteBasicsNode(Database);
sqliteBasics.open = async (name: string) => {
	try {
		const appPath = await resourceDir();
		const trimmedPath = appPath.replace('\\\\?\\', '');
		const db = await Database.load(`sqlite:${trimmedPath}${name}.db`);
		return db;
	} catch (error) {
		debugger;
	}
};

const config = {
	storage: getRxStorageSQLite({
		sqliteBasics: {
			open: async (name: string) => {
				try {
					const appPath = await resourceDir();
					const trimmedPath = appPath.replace('\\\\?\\', '');
					const db = await Database.load(`sqlite:${trimmedPath}${name}.db`);
					return db;
				} catch (error) {
					debugger;
				}
			},
			async run(db, queryWithParams) {
				try {
					if (!Array.isArray(queryWithParams.params)) {
						throw (
							(console.dir(queryWithParams),
							new Error('no params array given for query: ' + queryWithParams.query))
						);
					}
					const result = await db.execute(queryWithParams.query, queryWithParams.params);
					debugger;
					return result;
				} catch (error) {
					debugger;
				}
			},
			async all(db, queryWithParams) {
				try {
					const result = await db.execute(queryWithParams.query, queryWithParams.params);
					debugger;
					// return ensureNotFalsy(result.values);
					return result.values;
				} catch (error) {
					debugger;
				}
			},
			setPragma: async (db, r, a) => {
				try {
					const result = await db.execute('PRAGMA ' + r + ' = ' + a, []);
					return result;
				} catch (error) {
					debugger;
				}
			},
			close(db) {
				return db.close();
			},
			journalMode: '',
		},
	}),
};

export default config;

// {
// 	open: async (name: string) => {
// 		try {
// 			const appPath = await resourceDir();
// 			const trimmedPath = appPath.replace('\\\\?\\', '');
// 			const db = await Database.load(`sqlite:${trimmedPath}${name}.db`);
// 			return db;
// 		} catch (error) {
// 			debugger;
// 		}
// 	},
// 	async run(db, queryWithParams) {
// 		try {
// 			if (!Array.isArray(queryWithParams.params)) {
// 				throw (
// 					(console.dir(queryWithParams),
// 					new Error('no params array given for query: ' + queryWithParams.query))
// 				);
// 			}
// 			const result = await db.execute(queryWithParams.query, queryWithParams.params);
// 			return result;
// 		} catch (error) {
// 			debugger;
// 		}
// 	},
// 	async all(db, queryWithParams) {
// 		try {
// 			const result = await db.execute(queryWithParams.query, queryWithParams.params);
// 			// return ensureNotFalsy(result.values);
// 			return result.values;
// 		} catch (error) {
// 			debugger;
// 		}
// 	},
// 	setPragma: async (db, r, a) => {
// 		try {
// 			const result = await db.execute('PRAGMA ' + r + ' = ' + a, []);
// 			return result;
// 		} catch (error) {
// 			debugger;
// 		}
// 	},
// 	close(db) {
// 		return db.close();
// 	},
// 	journalMode: '',
// }
