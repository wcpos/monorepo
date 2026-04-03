import { removeRxDatabase } from 'rxdb-old';

import { getWebOldStorage } from './index.web';

export async function cleanupOldWebDatabase(oldDatabaseName: string) {
	await removeRxDatabase(oldDatabaseName, getWebOldStorage(), true);
}

export const cleanupOldDatabase = cleanupOldWebDatabase;
