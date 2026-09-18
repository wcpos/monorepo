import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import { getRepairOwnershipChannelName } from '../../plugins/repair-ownership';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';

export function getWebStorageWorkerPaths() {
	const runtime = globalThis as typeof globalThis & { opfsWorker?: string };

	return {
		targetOpfsWorker: runtime.opfsWorker ?? '/opfs.worker.js',
	};
}

export function getWebNewStorage() {
	const rawStorage = getRxStorageWorker({
		workerInput: getWebStorageWorkerPaths().targetOpfsWorker,
		workerOptions: { name: getRepairOwnershipChannelName() },
	});
	// 'raw' here is the worker client: one round trip through premium's RPC plus the
	// storage's own work inside the worker. Nothing in the page can split those two.
	return STORAGE_TIMING_PROBE_ENABLED ? withStorageTimingProbe(rawStorage, 'raw') : rawStorage;
}
