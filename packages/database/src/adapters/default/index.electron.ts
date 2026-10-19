import { getElectronNewStorage } from '../storage/index.electron';
import { wrappedErrorHandlerStorage } from '../../plugins/wrapped-error-handler-storage';

const rendererStorage = getElectronNewStorage();

export const storage = wrappedErrorHandlerStorage({ storage: rendererStorage });

const devStorage = __DEV__
	? require('rxdb/plugins/validate-z-schema').wrappedValidateZSchemaStorage({ storage })
	: null;

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // False for single page electron app
	ignoreDuplicate: !!__DEV__,
};
