import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import { getRepairOwnershipChannelName } from '../../plugins/repair-ownership';

export function getWebStorageWorkerPaths() {
	const runtime = globalThis as typeof globalThis & { opfsWorker?: string };

	return {
		targetOpfsWorker: runtime.opfsWorker ?? '/opfs.worker.js',
	};
}

export function getWebNewStorage() {
	return getRxStorageWorker({
		workerInput: getWebStorageWorkerPaths().targetOpfsWorker,
		workerOptions: { name: getRepairOwnershipChannelName() },
	});
}
