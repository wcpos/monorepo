import { getRxStorageIndexedDB } from 'rxdb-premium/plugins/storage-indexeddb';
import { getMemoryMappedRxStorage } from 'rxdb-premium/plugins/storage-memory-mapped';

/**
 * Here we use the IndexedDB RxStorage as persistence storage.
 */
const parentStorage = getRxStorageIndexedDB();

// wrap the persistent storage with the memory-mapped storage.
const storage = getMemoryMappedRxStorage({
	storage: parentStorage,
});

export const memorySyncedConfig = {
	storage,
};
