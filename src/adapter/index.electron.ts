import { getRxStorageSQLite } from './plugins/sqlite';

import type { SQLiteQueryWithParams } from './plugins/sqlite';

const sqliteBasics = {
	open: async (name: string) => {
		return window.ipcRenderer.invoke('sqlite', { type: 'open', name });
	},
	all: async (db, queryWithParams: SQLiteQueryWithParams) => {
		console.log(`all sql: ${queryWithParams.query}`, queryWithParams.params);

		const result = await window.ipcRenderer.invoke('sqlite', {
			type: 'all',
			name: db.name,
			sql: queryWithParams,
		});

		console.log(result);

		return result;
	},
	run: async (db, queryWithParams: SQLiteQueryWithParams) => {
		console.log(`run sql: ${queryWithParams.query}`, queryWithParams.params);

		await window.ipcRenderer.invoke('sqlite', {
			type: 'run',
			name: db.name,
			sql: queryWithParams,
		});
	},
	close: async (db) => {
		return window.ipcRenderer.invoke('sqlite', {
			type: 'close',
			name: db.name,
		});
	},
	journalMode: '',
};

const config = {
	storage: getRxStorageSQLite({
		/**
		 * Different runtimes have different interfaces to SQLite.
		 * For example in node.js we have a callback API,
		 * while in capacitor sqlite we have Promises.
		 * So we need a helper object that is capable of doing the basic
		 * sqlite operations.
		 */
		sqliteBasics,
	}),
	multiInstance: false,
	ignoreDuplicate: true,
};

export default config;
