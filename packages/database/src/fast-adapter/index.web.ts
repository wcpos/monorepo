import { getRxStorageIndexedDB } from 'rxdb-premium/plugins/storage-indexeddb';
// import { getMemoryMappedRxStorage } from 'rxdb-premium/plugins/storage-memory-mapped';
import { getRxStorageWorker, getRxStorageSharedWorker } from 'rxdb-premium/plugins/storage-worker';

let storage;

/**
 * Here we use the IndexedDB RxStorage as persistence storage.
 *
 * - if browser supports it we should use SharedWorker instead of Worker
 * - I have decided not to use MemoryMapped IDB with SharedWorker because some stores could have a lot of data
 */

// if (window?.mmIdbWorker && typeof SharedWorker !== 'undefined') {
// 	storage = getRxStorageSharedWorker({
// 		workerInput: window.mmIdbWorker,
// 	});
// } else if (window?.idbWorker) {
if (window?.idbWorker) {
	storage = getRxStorageWorker({
		workerInput: window.idbWorker,
	});
} else {
	// fallback to plain IndexedDB if no worker is available
	storage = getRxStorageIndexedDB();
}

export const fastConfig = {
	storage,
};
