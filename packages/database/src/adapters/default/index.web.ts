import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import {
	getWebNewStorage,
	onStorageWorkerLost,
	terminateStorageWorker,
} from '../storage/index.web';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';
import {
	reportStorageWorkerLost,
	wrappedErrorHandlerStorage,
} from '../../plugins/wrapped-error-handler-storage';

const workerStorage = getWebNewStorage();
onStorageWorkerLost((message) => reportStorageWorkerLost(undefined, message));

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI).
// Deadline behaviour: ../../plugins/STORAGE-CALL-DEADLINE-POLICY.md.
const errorHandlerStorage = wrappedErrorHandlerStorage({
	storage: workerStorage,
	onCondemn: terminateStorageWorker,
});
export const storage = STORAGE_TIMING_PROBE_ENABLED
	? withStorageTimingProbe(errorHandlerStorage, 'wrapped')
	: errorHandlerStorage;

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	// SQLite's pool holds exclusive origin handles (#2146, #2242). The previous
	// OPFS-filesystem era required true (#1057/#1987): false there caused #1049.
	// Flip with the engine, as pinned by multi-instance-ruling.test.ts; README Decision.
	multiInstance: false,
	ignoreDuplicate: !!__DEV__,
};
