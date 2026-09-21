import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import { getRepairOwnershipChannelName } from '../../plugins/repair-ownership';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';
import {
	WEB_STORAGE_ENGINE,
	WEB_WORKER_BASENAME_BY_ENGINE,
	WEB_WORKER_PATH_BY_ENGINE,
} from './storage-engines';

export function getWebStorageWorkerPaths() {
	const runtime = globalThis as typeof globalThis & { opfsWorker?: string };
	const enginePath = WEB_WORKER_PATH_BY_ENGINE[WEB_STORAGE_ENGINE];
	const override = runtime.opfsWorker;

	// An override is normal: the page bootstrap sets `globalThis.opfsWorker`, and the
	// published web bundle rewrites it to a CDN URL. Its directory is not ours to
	// predict, but its BASENAME says which engine's worker it is — and an override
	// naming the WRONG engine is worse than no override at all, because the app would
	// run the previous storage engine while `multiInstance` and everything else are
	// configured for the current one. Refuse it and use the engine's own path.
	if (override !== undefined && !endsWithWorkerFile(override, WEB_STORAGE_ENGINE)) {
		console.error(
			`[storage] Ignoring globalThis.opfsWorker ${JSON.stringify(override)}: it does not name ` +
				`the worker required by the '${WEB_STORAGE_ENGINE}' engine ` +
				`(${WEB_WORKER_BASENAME_BY_ENGINE[WEB_STORAGE_ENGINE]}). Update the page bootstrap.`
		);

		return { targetOpfsWorker: enginePath };
	}

	return {
		targetOpfsWorker: override ?? enginePath,
	};
}

/** True when `path` names the worker file the given engine requires, at any URL or directory. */
function endsWithWorkerFile(path: string, engine: typeof WEB_STORAGE_ENGINE): boolean {
	const basename = WEB_WORKER_BASENAME_BY_ENGINE[engine];
	// Strip a query string or hash before comparing — a cache-busted CDN URL keeps the
	// file name but not the final character.
	const withoutSuffix = path.split(/[?#]/, 1)[0];

	return withoutSuffix === basename || withoutSuffix.endsWith(`/${basename}`);
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
