/**
 * The files a scope database occupies on NATIVE (expo-sqlite under
 * `Documents/wcpos-sqlite`): what the previous-generation drain uses to ask
 * whether a drainable database exists WITHOUT opening it (opening a missing
 * SQLite database creates one), and to delete it once rxdb has dropped its
 * tables (premium SQLite `remove()` drops tables and closes, but the file and
 * its WAL stay at full size).
 *
 * expo-sqlite names the file after the database exactly (`openDatabaseAsync(name,
 * …, NATIVE_SQLITE_ROOT.uri)` in `adapters/storage/sqlite-pool.ts`); SQLite's
 * sidecars append `-wal`, `-shm` or `-journal`.
 *
 * Web (`.web.ts`) and Electron (`.electron.ts`) export `null`: their files live
 * behind the storage worker / the main process, which expose no listing or
 * delete to the page — see those files.
 */

import { NATIVE_SQLITE_ROOT } from './adapters/storage/sqlite-root';

export type ScopeDatabaseFiles = {
	/** Every database file in the SQLite root, by name (sidecars excluded). Never opens one. */
	list(): Promise<string[]>;
	/** True when the database's own file exists. Never opens it. */
	exists(databaseName: string): Promise<boolean>;
	/** Delete the database's file and its sidecars; returns how many files went. Call only once it is closed. */
	remove(databaseName: string): Promise<number>;
};

const SQLITE_SIDECAR_SUFFIXES = ['-wal', '-shm', '-journal'] as const;

function entriesOf(databaseName: string) {
	if (!NATIVE_SQLITE_ROOT.exists) return [];
	return NATIVE_SQLITE_ROOT.list().filter(
		(entry) =>
			entry.name === databaseName ||
			SQLITE_SIDECAR_SUFFIXES.some((suffix) => entry.name === `${databaseName}${suffix}`)
	);
}

export const scopeDatabaseFiles: ScopeDatabaseFiles | null = {
	async list() {
		if (!NATIVE_SQLITE_ROOT.exists) return [];
		return NATIVE_SQLITE_ROOT.list()
			.map((entry) => entry.name)
			.filter((name) => !SQLITE_SIDECAR_SUFFIXES.some((suffix) => name.endsWith(suffix)));
	},
	async exists(databaseName) {
		return entriesOf(databaseName).some((entry) => entry.name === databaseName);
	},
	async remove(databaseName) {
		const entries = entriesOf(databaseName);
		for (const entry of entries) entry.delete();
		return entries.length;
	},
};
