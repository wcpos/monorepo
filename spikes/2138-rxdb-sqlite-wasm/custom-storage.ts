/* eslint-disable import/no-unresolved -- this file is copied over test/unit/custom-storage.ts
   inside the rxdb clone by run-conformance.sh; its imports resolve there, not here. */
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import { isNode } from '../../plugins/test-utils/index.mjs';
import { wrappedValidateAjvStorage } from '../../plugins/validate-ajv/index.mjs';
import { getSQLiteBasicsOo1 } from '../../spike-2138/sqlite-basics-oo1.mjs';

import type { RxTestStorage } from '../../plugins/core/index.mjs';

const JOURNAL_MODE = 'WAL';
let storage: ReturnType<RxTestStorage['getStorage']>;
export const CUSTOM_STORAGE: RxTestStorage = {
	name: 'sqlite-wasm-oo1',
	async init() {
		if (isNode) {
			const { default: sqlite3InitModule } = await import(
				/* webpackIgnore: true */ '@sqlite.org/sqlite-wasm'
			);
			const sqlite3 = await sqlite3InitModule();
			storage = getRxStorageSQLite({
				sqliteBasics: getSQLiteBasicsOo1({
					journalMode: JOURNAL_MODE,
					openDb: (name: string) => new sqlite3.oo1.DB(name),
				}),
			});
		} else {
			// mode 'one': a single long-lived worker for everything. The default ('storage')
			// drops the channel when its last instance closes and spawns a new worker for the
			// next one, but premium never terminates the old worker, so its pool VFS still
			// holds the OPFS access handles and the new pool's install fails
			// (NoModificationAllowedError from createSyncAccessHandle, seen in the
			// "open many instances on the same database name" test).
			storage = getRxStorageWorker({
				workerInput: '/files/spike-2138/sqlite-worker.js',
				workerOptions: { type: 'module' },
				mode: 'one',
			});
		}
	},
	getStorage() {
		return wrappedValidateAjvStorage({ storage });
	},
	getPerformanceStorage() {
		return { description: 'sqlite-wasm-oo1', storage: CUSTOM_STORAGE.getStorage() };
	},
	hasPersistence: true,
	hasMultiInstance: true,
	hasAttachments: true,
	hasReplication: true,
};
