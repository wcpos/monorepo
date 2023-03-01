import log from '@wcpos/utils/src/logger';

import { getRxStorageSQLite } from './plugins/storage-sqlite';

type SQLiteQueryWithParams = any;

/**
 *
 */
const config = {
	storage: getRxStorageSQLite({
		sqliteBasics: {
			open: async (name: string) => {
				try {
					const result = await window.ipcRenderer.invoke('sqlite', { type: 'open', name });
					return result;
				} catch (error) {
					log.error(error);
				}
			},
			all: async (db, queryWithParams: SQLiteQueryWithParams) => {
				try {
					const result = await window.ipcRenderer.invoke('sqlite', {
						type: 'all',
						name: db.name,
						sql: queryWithParams,
					});
					return result;
				} catch (error) {
					log.error(error);
				}
			},
			run: async (db, queryWithParams: SQLiteQueryWithParams) => {
				try {
					await window.ipcRenderer.invoke('sqlite', {
						type: 'run',
						name: db.name,
						sql: queryWithParams,
					});
					return db;
				} catch (error) {
					log.error(error);
				}
			},
			setPragma: async (db, r, a) => {
				try {
					await window.ipcRenderer.invoke('sqlite', {
						type: 'run',
						name: db.name,
						sql: { query: 'PRAGMA ' + r + ' = ' + a, params: [] },
					});
					return db;
				} catch (error) {
					log.error(error);
				}
			},
			close: async (db) => {
				try {
					window.ipcRenderer.invoke('sqlite', {
						type: 'close',
						name: db.name,
					});
				} catch (error) {
					log.error(error);
				}
			},
			journalMode: 'WAL2',
		},
	}),
	multiInstance: false,
	ignoreDuplicate: true,
};
// const parentStorage = getRxStorageSQLite({ sqliteBasics });

// const storage = wrappedValidateAjvStorage({
// 	storage: getRxStorageSQLite({ sqliteBasics }),
// });

export default config;
