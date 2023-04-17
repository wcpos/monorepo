import { RxStorageOPFSStatics } from './plugins/storage-opfs';
import { getRxStorageWorker } from './plugins/storage-worker';

// const parentStorage = wrappedValidateZSchemaStorage({ storage: getRxStorageIndexedDB() });
// const parentStorage = wrappedValidateAjvStorage({
// 	storage: getRxStorageIndexedDB(),
// });

const config = {
	storage: getRxStorageWorker({
		statics: RxStorageOPFSStatics,
		/**
		 * This file must be statically served from a webserver.
		 * You might want to first copy it somewhere outside of
		 * your node_modules folder.
		 */
		workerInput: '/wp-content/plugins/woocommerce-pos/workers/opfs.worker.js',
	}),
};

export default config;
