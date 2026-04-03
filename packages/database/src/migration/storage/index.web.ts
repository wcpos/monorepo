import { getRxStorageRemote } from 'rxdb-old/plugins/storage-remote';
import { PROMISE_RESOLVE_VOID } from 'rxdb-old/plugins/utils';
import { Subject } from 'rxjs';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import type { MessageFromRemote } from 'rxdb-old/plugins/storage-remote';

type WorkerInput = string | (() => Worker);

interface OldWorkerStorageOptions {
	mode?: 'storage' | 'database' | 'collection' | 'one';
	workerInput: WorkerInput;
	workerOptions?: WorkerOptions;
}

function getOldRxStorageWorker({ mode, workerInput, workerOptions }: OldWorkerStorageOptions) {
	return getRxStorageRemote({
		identifier: `rx-storage-worker-${String(workerInput)}`,
		mode,
		messageChannelCreator() {
			const worker =
				typeof workerInput === 'function' ? workerInput() : new Worker(workerInput, workerOptions);

			if (!(worker instanceof Worker)) {
				throw new Error('no Worker given');
			}

			const messages$ = new Subject<MessageFromRemote>();
			const handleMessage = (event: MessageEvent<MessageFromRemote>) => {
				messages$.next(event.data);
			};
			const handleError = () => {
				// keep parity with upstream worker client by subscribing to errors
			};

			worker.addEventListener('error', handleError);
			worker.addEventListener('message', handleMessage);

			return Promise.resolve({
				messages$,
				send(message: unknown) {
					worker.postMessage(message);
				},
				close() {
					worker.removeEventListener('message', handleMessage);
					worker.removeEventListener('error', handleError);
					return PROMISE_RESOLVE_VOID;
				},
			});
		},
	});
}

export function getWebStorageWorkerPaths() {
	return {
		legacyIndexedDbWorker: '/indexeddb.worker.js',
		targetOpfsWorker: '/opfs.worker.js',
	};
}

export function getWebOldStorage() {
	return getOldRxStorageWorker({
		workerInput: getWebStorageWorkerPaths().legacyIndexedDbWorker,
	});
}

export function getWebNewStorage() {
	return getRxStorageWorker({
		workerInput: getWebStorageWorkerPaths().targetOpfsWorker,
	});
}

export function getStorageMigrationConfig() {
	return {
		oldStorage: getWebOldStorage(),
		sourceStorage: 'indexeddb-worker',
		targetStorage: 'opfs-worker',
	};
}
