import { getRxStorageRemote } from 'rxdb-old/plugins/storage-remote';
import { createBlobFromBase64 } from 'rxdb/plugins/utils';
import { PROMISE_RESOLVE_VOID } from 'rxdb-old/plugins/utils';
import { Subject } from 'rxjs';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import type { MessageFromRemote } from 'rxdb-old/plugins/storage-remote';
import type { StorageMigrationConfig, StorageMigrationDatabaseKind } from './types';

export { prepareOldDatabaseForStorageMigration } from './prepare-old-database';

type WorkerInput = string | (() => Worker);

type LegacyRemoteAttachmentData = Blob | string;

type LegacyRemoteStorageInstance = {
	getAttachmentData?: (...args: unknown[]) => Promise<LegacyRemoteAttachmentData>;
};

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
			const ownsWorker = typeof workerInput !== 'function';
			const worker = ownsWorker ? new Worker(workerInput, workerOptions) : workerInput();

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
					if (ownsWorker) {
						worker.terminate();
					}
					return PROMISE_RESOLVE_VOID;
				},
			});
		},
	});
}

async function normalizeLegacyAttachmentData(data: LegacyRemoteAttachmentData): Promise<Blob> {
	if (data instanceof Blob) {
		return data;
	}

	return createBlobFromBase64(data, '');
}

export function getWebStorageWorkerPaths() {
	return {
		legacyIndexedDbWorker: '/indexeddb.worker.js',
		targetOpfsWorker: '/opfs.worker.js',
	};
}

export function getWebOldStorage() {
	const storage = getOldRxStorageWorker({
		workerInput: getWebStorageWorkerPaths().legacyIndexedDbWorker,
	});

	if (typeof storage.createStorageInstance !== 'function') {
		return storage;
	}

	const originalCreateStorageInstance = storage.createStorageInstance.bind(storage);
	storage.createStorageInstance = (async (...args: unknown[]) => {
		const instance = (await (
			originalCreateStorageInstance as (...createArgs: unknown[]) => Promise<unknown>
		)(...args)) as LegacyRemoteStorageInstance;

		if (instance.getAttachmentData) {
			const getAttachmentData = instance.getAttachmentData.bind(instance);
			instance.getAttachmentData = async (...attachmentArgs: unknown[]) => {
				const data = await getAttachmentData(...attachmentArgs);
				return normalizeLegacyAttachmentData(data);
			};
		}

		return instance;
	}) as typeof storage.createStorageInstance;

	return storage;
}

export function getWebNewStorage() {
	return getRxStorageWorker({
		workerInput: getWebStorageWorkerPaths().targetOpfsWorker,
	});
}

export function getStorageMigrationConfig(
	_databaseKind: StorageMigrationDatabaseKind
): StorageMigrationConfig {
	return {
		oldStorage: getWebOldStorage(),
		sourceStorage: 'indexeddb-worker',
		targetStorage: 'opfs-worker',
	};
}
