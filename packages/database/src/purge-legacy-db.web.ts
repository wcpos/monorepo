import { isLegacyAppDatabaseName } from './database-names';

export interface PurgeLegacyDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

const RXDB_DIRECTORY_PREFIX = 'rxdb-';

const fromOpfsSafeName = (value: string) => value.replace(/__/g, '/');

const isLegacyAppOpfsEntry = (name: string) =>
	name.startsWith(RXDB_DIRECTORY_PREFIX) &&
	isLegacyAppDatabaseName(fromOpfsSafeName(name.slice(RXDB_DIRECTORY_PREFIX.length)));

const deleteLegacyIndexedDbDatabases = async () => {
	const databases = await indexedDB.databases();
	const legacyDatabases = databases.filter((db) => db.name && isLegacyAppDatabaseName(db.name));
	const deletePromises = legacyDatabases.map(
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
	return legacyDatabases.length;
};

const deleteLegacyOpfsDatabases = async () => {
	if (!navigator.storage?.getDirectory) {
		return 0;
	}

	const root = await navigator.storage.getDirectory();
	const entriesToDelete: string[] = [];

	for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
		if (isLegacyAppOpfsEntry(name)) {
			entriesToDelete.push(name);
		}
	}

	await Promise.all(entriesToDelete.map((name) => root.removeEntry(name, { recursive: true })));
	return entriesToDelete.length;
};

export const purgeLegacyDatabases = async (): Promise<PurgeLegacyDBResult> => {
	const [deletedIndexedDbDatabases, deletedOpfsDatabases] = await Promise.all([
		deleteLegacyIndexedDbDatabases(),
		deleteLegacyOpfsDatabases(),
	]);
	const databasesDeleted = deletedIndexedDbDatabases + deletedOpfsDatabases;
	const message =
		databasesDeleted > 0
			? `Successfully purged ${databasesDeleted} legacy database entries`
			: 'No legacy databases found to purge';

	return {
		success: true,
		message,
		databasesDeleted,
	};
};
