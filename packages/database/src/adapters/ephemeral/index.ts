import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

export const storage = getRxStorageMemory();

export const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const ephemeralStorageConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // must be false for react native
	ignoreDuplicate: !!__DEV__,
};
