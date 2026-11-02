import { DatabaseSync } from 'node:sqlite';

import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { getRxStorageSQLite, getSQLiteBasicsNodeNative } from 'rxdb-premium/plugins/storage-sqlite';

const sqliteBasics = getSQLiteBasicsNodeNative(DatabaseSync);
const open = sqliteBasics.open;
// Premium shares each opened connection by database name; distinct names get isolated memory DBs.
sqliteBasics.open = async () => {
	const database = await open(':memory:');
	database.exec('PRAGMA synchronous = NORMAL');
	return database;
};

export const storages = [
	['memory', getRxStorageMemory()],
	['sqlite', getRxStorageSQLite({ sqliteBasics, storeAttachmentsAsBase64String: true })],
] as const;
