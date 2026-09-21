import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import { getRepairOwnershipChannelName } from '../../plugins/repair-ownership';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';
import { WEB_STORAGE_ENGINE, WEB_WORKER_PATH_BY_ENGINE } from './storage-engines';

export function getWebStorageWorkerPaths() {
	const runtime = globalThis as typeof globalThis & { opfsWorker?: string };

	// The engine selects the worker bundle. `globalThis.opfsWorker` still wins: the
	// published web bundle rewrites it to a CDN path at load time.
	return {
		targetOpfsWorker: runtime.opfsWorker ?? WEB_WORKER_PATH_BY_ENGINE[WEB_STORAGE_ENGINE],
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
