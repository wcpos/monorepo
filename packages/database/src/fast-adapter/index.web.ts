import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

const storage = getRxStorageWorker({
	/**
	 * Contains any value that can be used as parameter
	 * to the Worker constructor of thread.js
	 * Most likely you want to put the path to the worker.js file in here.
	 *
	 * @link https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker
	 */
	workerInput: globalThis.idbWorker,
	/**
	 * (Optional) options
	 * for the worker.
	 */
	// workerOptions: {
	// 	type: 'module',
	// 	credentials: 'omit',
	// },
});

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const fastConfig = { storage: __DEV__ ? devStorage : storage };
