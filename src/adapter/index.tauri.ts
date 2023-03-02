import { resourceDir } from '@tauri-apps/api/path';
import Database from 'tauri-plugin-sql-api';

import log from '@wcpos/utils/src/logger';

import { getRxStorageSQLite } from './plugins/storage-sqlite';

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
					log.error(error);
				}
			},
			all: async (db, queryWithParams) => {
				try {
					const result = await db.select(queryWithParams.query, queryWithParams.params);
					return result;
				} catch (error) {
					log.error(error);
				}
			},
			run: async (db, queryWithParams) => {
				try {
					if (!Array.isArray(queryWithParams.params)) {
						throw (
							(console.dir(queryWithParams),
							new Error('no params array given for query: ' + queryWithParams.query))
						);
					}
					const result = await db.execute(queryWithParams.query, queryWithParams.params);
					return result;
				} catch (error) {
					log.error(error);
				}
			},
			setPragma: async (db, r, a) => {
				try {
					const result = await db.execute('PRAGMA ' + r + ' = ' + a, []);
					return result;
				} catch (error) {
					log.error(error);
				}
			},
			close: async (db) => {
				return db.close();
			},
			journalMode: 'WAL',
		},
	}),
};

export default config;
