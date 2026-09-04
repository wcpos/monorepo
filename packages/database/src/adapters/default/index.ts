import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { getNativeNewStorage } from '../storage';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const nativeStorage = getNativeNewStorage();

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
const errorHandlerStorage = wrappedErrorHandlerStorage({ storage: nativeStorage });
export const storage = STORAGE_TIMING_PROBE_ENABLED
	? withStorageTimingProbe(errorHandlerStorage, 'wrapped')
	: errorHandlerStorage;

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false,
	ignoreDuplicate: !!__DEV__,
};
