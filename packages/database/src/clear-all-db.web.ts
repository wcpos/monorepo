import { APP_DATABASE_PREFIXES, isKnownAppDatabaseName } from './migration/storage/database-names';

interface ClearDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

const RXDB_DIRECTORY_PREFIX = 'rxdb-';

const toOpfsSafeName = (value: string) => value.replace(/\//g, '__');

const isKnownAppOpfsEntry = (name: string) =>
	APP_DATABASE_PREFIXES.map(toOpfsSafeName).some((prefix) =>
		name.startsWith(`${RXDB_DIRECTORY_PREFIX}${prefix}`)
	);

/**
 * Delete all IndexedDB databases (legacy storage).
 */
const deleteIndexedDbDatabases = async () => {
	const databases = await indexedDB.databases();
	const appDatabases = databases.filter((db) => db.name && isKnownAppDatabaseName(db.name));
	const deletePromises = appDatabases.map(
		(db) =>
			new Promise<void>((resolve, reject) => {
				if (!db.name) {
					resolve();
					return;
				}

				const request = indexedDB.deleteDatabase(db.name);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(new Error(`Failed to delete IndexedDB: ${db.name}`));
				request.onblocked = () => reject(new Error(`Blocked deleting IndexedDB: ${db.name}`));
			})
	);

	await Promise.all(deletePromises);
	return appDatabases.length;
};

/**
 * Delete known app entries from the OPFS root (new storage).
 */
const deleteOpfsDatabases = async () => {
	if (!navigator.storage?.getDirectory) {
		return 0;
	}

	const root = await navigator.storage.getDirectory();
	const entriesToDelete: string[] = [];

	for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
		if (isKnownAppOpfsEntry(name)) {
			entriesToDelete.push(name);
		}
	}

	await Promise.all(entriesToDelete.map((name) => root.removeEntry(name, { recursive: true })));
	return entriesToDelete.length;
};

export const clearAllDB = async (): Promise<ClearDBResult> => {
	const [deletedIndexedDbDatabases, deletedOpfsDatabases] = await Promise.all([
		deleteIndexedDbDatabases(),
		deleteOpfsDatabases(),
	]);
	const databasesDeleted = deletedIndexedDbDatabases + deletedOpfsDatabases;
	const message =
		databasesDeleted > 0
			? `Successfully cleared ${databasesDeleted} database entries`
			: 'No databases found to clear (this might mean the app is already in a clean state)';

	return {
		success: true,
		message,
		databasesDeleted,
	};
};
