import { getRxStorageIndexedDB } from 'rxdb-premium/plugins/storage-indexeddb';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

// const config = {
// 	storage: getRxStorageIndexedDB(),
// };

const config = {
	storage: getRxStorageWorker({
		/**
		 * Contains any value that can be used as parameter
		 * to the Worker constructor of thread.js
		 * Most likely you want to put the path to the worker.js file in here.
		 *
		 * @link https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker
		 */
		workerInput: window.idbWorker,
		/**
		 * (Optional) options
		 * for the worker.
		 */
		// workerOptions: {
		// 	type: 'module',
		// 	credentials: 'omit',
		// },
	}),
};

export default config;
