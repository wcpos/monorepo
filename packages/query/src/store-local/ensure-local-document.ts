import type { StoreDatabase } from '@wcpos/database';

import { StoreDatabaseUnavailableError } from '../commands/printer-profiles';

import type { StoreLocalDatabase } from '../reads/store-local';

export function storeDatabase(database: StoreLocalDatabase): StoreDatabase {
	if (!database) throw new StoreDatabaseUnavailableError();
	return database as StoreDatabase;
}

export async function ensureLocalDocument<T extends Record<string, unknown>>(
	database: StoreLocalDatabase,
	id: string,
	empty: T
) {
	const storeDB = storeDatabase(database);
	const existing = await storeDB.getLocal<T>(id);
	if (existing) return existing;
	try {
		return await storeDB.insertLocal<T>(id, empty);
	} catch (error) {
		// Another tab may have initialized it. Never replace that tab's pending work.
		const winner = await storeDB.getLocal<T>(id);
		if (winner) return winner;
		throw error;
	}
}
