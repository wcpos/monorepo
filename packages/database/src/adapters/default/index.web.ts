import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const workerStorage = getRxStorageWorker({
	workerInput: (globalThis as Record<string, any>).idbWorker,
});

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
export const storage = wrappedErrorHandlerStorage({ storage: workerStorage });

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	ignoreDuplicate: !!__DEV__,
};
