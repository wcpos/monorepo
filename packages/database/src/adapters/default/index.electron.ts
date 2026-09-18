import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { getElectronNewStorage } from '../storage/index.electron';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const rendererStorage = getElectronNewStorage();

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
const errorHandlerStorage = wrappedErrorHandlerStorage({ storage: rendererStorage });
export const storage = STORAGE_TIMING_PROBE_ENABLED
	? withStorageTimingProbe(errorHandlerStorage, 'wrapped')
	: errorHandlerStorage;

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // False for single page electron app
	ignoreDuplicate: !!__DEV__,
};
