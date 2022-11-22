import { clone } from 'rxdb';

import log from '@wcpos/utils/src/logger';

import { wrappedValidateAjvStorage } from '../plugins/validate';
import { mangoQuerySelectorToSQL } from './mangoQuerySelectorToSQL';
import { getRxStorageSQLite } from './plugins/sqlite';
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
		log.debug(`all sql: ${queryWithParams.query}`, queryWithParams.params);

		const result = await window.ipcRenderer
			.invoke('sqlite', {
				type: 'all',
				name: db.name,
				sql: queryWithParams,
			})
			.catch((error) => {
				log.error(error);
			});

		log.silly(result);

		return result;
	},
	run: async (db, queryWithParams: SQLiteQueryWithParams) => {
		log.debug(`run sql: ${queryWithParams.query}`, queryWithParams.params);

		await window.ipcRenderer
			.invoke('sqlite', {
				type: 'run',
				name: db.name,
				sql: queryWithParams,
			})
			.catch((error) => {
				log.error(error);
			});
	},
	close: async (db) => {
		return window.ipcRenderer.invoke('sqlite', {
			type: 'close',
			name: db.name,
		});
	},
	journalMode: 'WAL',
};

// const parentStorage = getRxStorageSQLite({ sqliteBasics });

const storage = wrappedValidateAjvStorage({
	storage: getRxStorageSQLite({ sqliteBasics }),
});

/**
 *
 */
const config = {
	storage,
	// storage: getMemorySyncedRxStorage({
	// 	storage: parentStorage,

	// 	/**
	// 	 * Defines how many document
	// 	 * get replicated in a single batch.
	// 	 * [default=50]
	// 	 *
	// 	 * (optional)
	// 	 */
	// 	batchSize: 50,

	// 	/**
	// 	 * By default, the parent storage will be created without indexes for a faster page load.
	// 	 * Indexes are not needed because the queries will anyway run on the memory storage.
	// 	 * You can disable this behavior by setting keepIndexesOnParent to true.
	// 	 *
	// 	 * (optional)
	// 	 */
	// 	keepIndexesOnParent: true,

	// 	/**
	// 	 * After a write, await until the return value of this method resolves
	// 	 * before replicating with the master storage.
	// 	 *
	// 	 * By returning requestIdlePromise() we can ensure that the CPU is idle
	// 	 * and no other, more important operation is running. By doing so we can be sure
	// 	 * that the replication does not slow down any rendering of the browser process.
	// 	 *
	// 	 * (optional)
	// 	 */
	// 	waitBeforePersist: () => requestIdlePromise(),
	// }),
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
