import { isLegacyAppDatabaseName, isLegacyUserDatabaseName } from './database-names';

export interface PurgeLegacyDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
	/** A retired user database was among the deleted entries: its device-local settings are gone. */
	legacyUserDatabaseFound: boolean;
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
	return legacyDatabases.map((db) => db.name ?? '');
};

const deleteLegacyOpfsDatabases = async () => {
	if (!navigator.storage?.getDirectory) {
		return [];
	}

	const root = await navigator.storage.getDirectory();
	const entriesToDelete: string[] = [];

	for await (const [name] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
		if (isLegacyAppOpfsEntry(name)) {
			entriesToDelete.push(name);
		}
	}

	await Promise.all(entriesToDelete.map((name) => root.removeEntry(name, { recursive: true })));
	return entriesToDelete.map((name) => fromOpfsSafeName(name.slice(RXDB_DIRECTORY_PREFIX.length)));
};

/**
 * Web purges the retired ENGINES only: IndexedDB databases and `rxdb-` OPFS
 * directories whose names are an earlier generation. A retired generation
 * (`v8`/`v9`, beside the current one since the 2.0 schema reset) that lives
 * inside the live SQLite pool is not purged here and cannot be from the page:
 * the `opfs-sahpool` VFS runs in the storage worker, holds exclusive sync access
 * handles on every pool file, keeps the database names only in its own header
 * (the OPFS entries are opaque), and the worker exposes rxdb's storage protocol
 * alone — no list, no unlink (see `scope-database-files.web.ts`). Reaching them
 * would take a new worker message AND a plugin release re-vendoring the worker.
 * Those files go with "Clear local data", which removes the whole pool directory
 * (`clear-all-db.web.ts`). Native runs the by-name pass over its live root
 * because its files are plain (`purge-legacy-db.ts`).
 */
export const purgeLegacyDatabases = async (): Promise<PurgeLegacyDBResult> => {
	const [deletedIndexedDbDatabases, deletedOpfsDatabases] = await Promise.all([
		deleteLegacyIndexedDbDatabases(),
		deleteLegacyOpfsDatabases(),
	]);
	const deletedNames = [...deletedIndexedDbDatabases, ...deletedOpfsDatabases];
	const databasesDeleted = deletedNames.length;
	const message =
		databasesDeleted > 0
			? `Successfully purged ${databasesDeleted} legacy database entries`
			: 'No legacy databases found to purge';

	return {
		success: true,
		message,
		databasesDeleted,
		legacyUserDatabaseFound: deletedNames.some(isLegacyUserDatabaseName),
	};
};
