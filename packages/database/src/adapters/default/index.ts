import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { getNativeNewStorage } from '../../migration/storage';

export const storage = getNativeNewStorage();

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false,
	ignoreDuplicate: !!__DEV__,
};
