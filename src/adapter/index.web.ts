import { getRxStorageIndexedDB } from 'rxdb-premium/plugins/indexeddb';

const config = {
	storage: getRxStorageIndexedDB({
		/**
		 * For better performance, queries run with a batched cursor.
		 * You can change the batchSize to optimize the query time
		 * for specific queries.
		 * You should only change this value when you are also doing performance measurements.
		 * [default=50]
		 */
		batchSize: 50,
	}),
};

export default config;
