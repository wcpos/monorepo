import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

export function getWebStorageWorkerPaths() {
	const runtime = globalThis as typeof globalThis & { opfsWorker?: string };

	return {
		targetOpfsWorker: runtime.opfsWorker ?? '/opfs.worker.js',
	};
}

export function getWebNewStorage() {
	return getRxStorageWorker({
		workerInput: getWebStorageWorkerPaths().targetOpfsWorker,
	});
}
