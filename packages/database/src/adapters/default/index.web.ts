import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { getWebNewStorage } from '../../migration/storage/index.web';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const workerStorage = getWebNewStorage();

// Always wrap with error handler (catches/logs raw RxDB errors before they reach UI)
export const storage = wrappedErrorHandlerStorage({ storage: workerStorage });

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	ignoreDuplicate: !!__DEV__,
};
