import { Directory, Paths } from 'expo-file-system';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { isLegacyAppDatabaseName } from './database-names';

const dbLogger = getLogger(['wcpos', 'db', 'purge-legacy']);
const OPFS_ROOTS = ['.expo-opfs', '.worklet-opfs'].map(
	(root) => new Directory(Paths.document, root)
);
const LEGACY_SQLITE_DIRECTORY = new Directory(Paths.document, 'SQLite');
const RXDB_DIRECTORY_PREFIX = 'rxdb-';

export interface PurgeLegacyDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

const fromFilesystemSafeName = (value: string) => value.replace(/__/g, '/');

const isLegacyAppFilesystemEntry = (name: string) =>
	name.startsWith(RXDB_DIRECTORY_PREFIX) &&
	isLegacyAppDatabaseName(fromFilesystemSafeName(name.slice(RXDB_DIRECTORY_PREFIX.length)));

const deleteLegacySQLiteDatabases = () => {
	dbLogger.debug(`Checking SQLite database directory: ${LEGACY_SQLITE_DIRECTORY.uri}`);

	if (!LEGACY_SQLITE_DIRECTORY.exists) {
		dbLogger.debug('SQLite database directory does not exist');
		return 0;
	}

	// `Documents/SQLite` is expo-sqlite's SHARED directory, not a WCPOS-owned one,
	// so name what goes: legacy WCPOS databases and their sidecars. Removing the
	// directory wholesale also took anything else living there, and reported a
	// flat 1 — which the cashier reads as "purged 1 legacy database entries".
	const legacyEntries = LEGACY_SQLITE_DIRECTORY.list().filter((entry) =>
		isLegacyAppDatabaseName(entry.name)
	);

	for (const entry of legacyEntries) {
		dbLogger.debug(`Deleting legacy SQLite database entry: ${entry.name}`);
		entry.delete();
	}

	// `-wal`/`-shm` are SQLite's sidecars for a database already counted below —
	// they are deleted with it, but they are not themselves databases, and this
	// count is what the user-facing message reports.
	return legacyEntries.filter(
		(entry) => !entry.name.endsWith('-wal') && !entry.name.endsWith('-shm')
	).length;
};

const deleteLegacyFilesystemDatabases = () => {
	let deleted = 0;
	for (const root of OPFS_ROOTS) {
		if (!root.exists) continue;
		const contents = root.list();
		const legacyEntries = contents.filter((item) => isLegacyAppFilesystemEntry(item.name));

		for (const entry of legacyEntries) {
			dbLogger.debug(`Deleting legacy filesystem-backed database entry: ${entry.name}`);
			entry.delete();
		}
		deleted += legacyEntries.length;
	}
	return deleted;
};

export const purgeLegacyDatabases = async (): Promise<PurgeLegacyDBResult> => {
	try {
		dbLogger.debug('Starting to purge legacy application databases');
		const deletedSQLiteDatabases = deleteLegacySQLiteDatabases();
		const deletedFilesystemDatabases = deleteLegacyFilesystemDatabases();
		const databasesDeleted = deletedSQLiteDatabases + deletedFilesystemDatabases;
		const message =
			databasesDeleted > 0
				? `Successfully purged ${databasesDeleted} legacy database entries`
				: 'No legacy databases found to purge';

		dbLogger.info(message);

		return {
			success: true,
			message,
			databasesDeleted,
		};
	} catch (error) {
		dbLogger.error('Failed to purge legacy databases', {
			showToast: true,
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
};
