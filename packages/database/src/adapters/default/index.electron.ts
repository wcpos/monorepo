import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { getElectronNewStorage } from '../../migration/storage/index.electron';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const rendererStorage = getElectronNewStorage();

export const storage = wrappedErrorHandlerStorage({ storage: rendererStorage });

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // False for single page electron app
	ignoreDuplicate: !!__DEV__,
};
