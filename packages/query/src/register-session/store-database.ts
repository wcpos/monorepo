import type { StoreDatabase } from '@wcpos/database';

import { StoreDatabaseUnavailableError } from '../commands/printer-profiles';

import type { LocalDatabaseWithReset } from '../use-local-collection';

export type RegisterStoreDatabase = LocalDatabaseWithReset | null | undefined;

export function registerCollections(storeDB: RegisterStoreDatabase) {
	if (!storeDB) throw new StoreDatabaseUnavailableError();
	return storeDB.collections as StoreDatabase['collections'];
}
