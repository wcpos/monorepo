import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
// eslint-disable-next-line import/no-unresolved -- premium subpaths are resolved in licensed app builds.
import { getMemoryMappedRxStorage } from 'rxdb-premium/plugins/storage-memory-mapped';

import { storage } from '../default';

const fastStorage = getMemoryMappedRxStorage({
	storage,
});

const devStorage = wrappedValidateZSchemaStorage({
	storage: fastStorage,
});

export const fastStorageConfig = {
	storage: __DEV__ ? devStorage : fastStorage,
	multiInstance: false,
	ignoreDuplicate: !!__DEV__,
};
