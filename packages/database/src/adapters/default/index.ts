import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import { getNativeNewStorage } from '../../migration/storage';

// Expo filesystem/OPFS storage does not keep SQLite-style native connections in this module.
export const dbCache = new Map<string, never>();

export async function closeAllDatabases() {
	dbCache.clear();
}

if (__DEV__) {
	const previousCleanup = (globalThis as Record<string, unknown>)
		.__EXPO_SQLITE_CONNECTION_CLEANUP__;
	if (typeof previousCleanup === 'function') {
		void Promise.resolve(previousCleanup()).catch(() => {
			// Best-effort cleanup during HMR.
		});
	}

	(globalThis as Record<string, unknown>).__EXPO_SQLITE_CONNECTION_CLEANUP__ = closeAllDatabases;
}

export const storage = getNativeNewStorage();

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false,
	ignoreDuplicate: !!__DEV__,
};
