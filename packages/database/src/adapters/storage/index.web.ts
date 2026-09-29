import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';
import { RXDB_VERSION } from 'rxdb/plugins/utils';

import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';
import {
	WEB_STORAGE_ENGINE,
	WEB_WORKER_BASENAME_BY_ENGINE,
	WEB_WORKER_PATH_BY_ENGINE,
} from './storage-engines';

import type { RxStorage } from 'rxdb';

export function getWebStorageWorkerPaths() {
	const runtime = globalThis as typeof globalThis & { opfsWorker?: string };
	const enginePath = WEB_WORKER_PATH_BY_ENGINE[WEB_STORAGE_ENGINE];
	const override = runtime.opfsWorker;

	// An override is normal: the page bootstrap sets `globalThis.opfsWorker`, and the
	// WordPress host may supply a CDN URL. Its directory is not ours to
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

export const STORAGE_WORKER_NAME = 'wcpos-sqlite';
let storageWorker: Worker | undefined;
let innerStorage: ReturnType<typeof getRxStorageWorker> | undefined;
const workerLostListeners = new Set<(message: string) => void>();

export function onStorageWorkerLost(listener: (message: string) => void): () => void {
	workerLostListeners.add(listener);
	return () => {
		workerLostListeners.delete(listener);
	};
}

export function terminateStorageWorker(): void {
	storageWorker?.terminate();
	storageWorker = undefined;
	// Do not reset innerStorage: recovery requires reload, never an in-tab restart.
}

function createStorageWorker(): Worker {
	const worker = new Worker(getWebStorageWorkerPaths().targetOpfsWorker, {
		type: 'module',
		name: STORAGE_WORKER_NAME,
	});
	storageWorker = worker;
	// terminate() emits no error: the watchdog alone detects silent death. These
	// listeners catch script-load failures and crashes that DO report (#2242).
	for (const type of ['error', 'messageerror']) {
		worker.addEventListener(type, (event) => {
			const message = `Storage worker ${type}: ${'message' in event ? event.message : 'connection lost'}`;
			for (const listener of workerLostListeners) listener(message);
		});
	}
	return worker;
}

export function getWebNewStorage() {
	const rawStorage: RxStorage<unknown, unknown> = {
		name: 'worker',
		rxdbVersion: RXDB_VERSION,
		createStorageInstance(params) {
			// mode: one constructs a Worker eagerly; defer the entire client until
			// the first open so a parked tab can import the adapter without OPFS.
			innerStorage ??= getRxStorageWorker({
				workerInput: createStorageWorker,
				workerOptions: { type: 'module', name: STORAGE_WORKER_NAME },
				mode: 'one',
			});
			return innerStorage.createStorageInstance(params);
		},
	};
	return STORAGE_TIMING_PROBE_ENABLED ? withStorageTimingProbe(rawStorage, 'raw') : rawStorage;
}
