import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

export const storage = getRxStorageMemory();

export const devStorage = __DEV__
	? require('rxdb/plugins/validate-z-schema').wrappedValidateZSchemaStorage({ storage })
	: null;

export const ephemeralStorageConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // must be false for react native
	ignoreDuplicate: !!__DEV__,
};
