import { clone } from 'rxdb';
import { getRxStorageSQLite } from './plugins/sqlite';
import { mangoQuerySelectorToSQL } from './mangoQuerySelectorToSQL';
import { mangoQuerySortToSQL } from './plugins/sqlite/sqlite-statics';

import type { SQLiteQueryWithParams } from './plugins/sqlite';

/**
 *
 */
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

		await window.ipcRenderer
			.invoke('sqlite', {
				type: 'run',
				name: db.name,
				sql: queryWithParams,
			})
			.catch((error) => {
				debugger;
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
		sqliteBasics,
	}),
	multiInstance: false,
	ignoreDuplicate: true,
};

/**
 * Duck punch the prepareQuery function to implement our own mango-to-sqlite query converter.
 */
config.storage.statics.prepareQuery = (r, t) => {
	const a = t.limit ? `LIMIT ${t.limit}` : 'LIMIT -1';
	const n = t.skip ? `OFFSET ${t.skip}` : '';
	const o = [];
	let s = mangoQuerySelectorToSQL(t.selector, o);
	s = s !== '()' ? ` AND ${s} ` : '';
	let c = '';
	t.index && (c = `INDEXED BY "${u(t.index)}"`);
	return {
		schema: r,
		mangoQuery: clone(t),
		sqlQuery: {
			query: `${c} WHERE deleted=0 ${s}${mangoQuerySortToSQL(t.sort)} ${a} ${n} ;`,
			params: o,
		},
	};
};

export default config;
