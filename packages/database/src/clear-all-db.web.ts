import { APP_DATABASE_PREFIXES } from './migration/storage/database-names';

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
	const deletePromises = databases.map(
		(db) =>
			new Promise<void>((resolve, reject) => {
				if (!db.name) {
					resolve();
					return;
				}

				const request = indexedDB.deleteDatabase(db.name);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(new Error(`Failed to delete IndexedDB: ${db.name}`));
				request.onblocked = () => resolve();
			})
	);

	await Promise.all(deletePromises);
};

/**
 * Delete known app entries from the OPFS root (new storage).
 */
const deleteOpfsDatabases = async () => {
	if (!navigator.storage?.getDirectory) {
		return;
	}

	const root = await navigator.storage.getDirectory();
	const entriesToDelete: string[] = [];

	for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
		if (isKnownAppOpfsEntry(name)) {
			entriesToDelete.push(name);
		}
	}

	await Promise.all(entriesToDelete.map((name) => root.removeEntry(name, { recursive: true })));
};

export const clearAllDB = async (): Promise<void> => {
	await Promise.all([deleteIndexedDbDatabases(), deleteOpfsDatabases()]);
};
