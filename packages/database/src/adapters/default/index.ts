import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { getNativeNewStorage } from '../storage';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const nativeStorage = getNativeNewStorage();

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
export const storage = wrappedErrorHandlerStorage({ storage: nativeStorage });

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false,
	ignoreDuplicate: !!__DEV__,
};
