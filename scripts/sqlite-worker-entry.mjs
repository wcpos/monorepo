import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';

import {
	SQLITE_POOL_FILES_PER_DATABASE,
	SQLITE_POOL_GROWTH_STEP,
	SQLITE_POOL_INITIAL_CAPACITY,
	SQLITE_POOL_MAX_CAPACITY,
	SQLITE_POOL_NAME,
} from '../packages/database/src/adapters/storage/sqlite-pool.ts';
import { getSQLiteBasicsOo1 } from './sqlite-basics-oo1.mjs';
import { ensurePoolCapacity } from './sqlite-pool-capacity.mjs';
import { quietRecoveredConstraintWarnings } from './sqlite-quiet-constraint.mjs';

const wasmUrl = new URL('sqlite3.wasm', self.location.href);
// The plugin's worker cache-buster must select the matching wasm build too.
wasmUrl.search = self.location.search;
let ready;
const sqliteBasics = getSQLiteBasicsOo1({
	journalMode: 'WAL',
	async openDb(name) {
		ready ??= sqlite3InitModule({ locateFile: () => wasmUrl.href }).then((sqlite3) => {
			quietRecoveredConstraintWarnings(sqlite3);
			return sqlite3.installOpfsSAHPoolVfs({
				name: SQLITE_POOL_NAME,
				initialCapacity: SQLITE_POOL_INITIAL_CAPACITY,
				SQLITE_POOL_FILES_PER_DATABASE,
				SQLITE_POOL_GROWTH_STEP,
			});
		});
		const pool = await ready;
		await ensurePoolCapacity(pool, {
			filesPerDatabase: SQLITE_POOL_FILES_PER_DATABASE,
			growthStep: SQLITE_POOL_GROWTH_STEP,
			maxCapacity: SQLITE_POOL_MAX_CAPACITY,
		});
		return new pool.OpfsSAHPoolDb('/' + name);
	},
});
// Expose synchronously: awaiting wasm first loses the page's first RPC (#2242 spike).
// Browser workers have no Buffer, so premium must keep attachments as base64.
exposeWorkerRxStorage({
	storage: getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true }),
});
