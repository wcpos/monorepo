import { requestIdlePromise } from 'rxdb';

// import { wrappedValidateAjvStorage } from '../plugins/validate';

import { getRxStorageIndexedDB } from './plugins/storage-indexeddb';
import { getMemorySyncedRxStorage } from './plugins/storage-memory-synced';
import { wrappedValidateZSchemaStorage } from '../plugins/validate';

// const parentStorage = wrappedValidateZSchemaStorage({ storage: getRxStorageIndexedDB() });
// const parentStorage = wrappedValidateAjvStorage({
// 	storage: getRxStorageIndexedDB(),
// });

const config = {
	storage: getMemorySyncedRxStorage({
		storage: getRxStorageIndexedDB(),
		// storage: wrappedValidateZSchemaStorage({
		// 	storage: getRxStorageIndexedDB(),
		// }),

		/**
		 * Defines how many document
		 * get replicated in a single batch.
		 * [default=50]
		 *
		 * (optional)
		 */
		batchSize: 50,

		/**
		 * By default, the parent storage will be created without indexes for a faster page load.
		 * Indexes are not needed because the queries will anyway run on the memory storage.
		 * You can disable this behavior by setting keepIndexesOnParent to true.
		 *
		 * (optional)
		 */
		keepIndexesOnParent: true,

		/**
		 * After a write, await until the return value of this method resolves
		 * before replicating with the master storage.
		 *
		 * By returning requestIdlePromise() we can ensure that the CPU is idle
		 * and no other, more important operation is running. By doing so we can be sure
		 * that the replication does not slow down any rendering of the browser process.
		 *
		 * (optional)
		 */
		waitBeforePersist: () => requestIdlePromise(),
	}),
};

export default config;
