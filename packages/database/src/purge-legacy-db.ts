import { Directory, Paths } from 'expo-file-system';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { NATIVE_SQLITE_ROOT } from './adapters/storage/sqlite-root';
import { isLegacyAppDatabaseName } from './database-names';

const dbLogger = getLogger(['wcpos', 'db', 'purge-legacy']);
const EXPO_OPFS_ROOT = new Directory(Paths.document, '.expo-opfs');
const LEGACY_SQLITE_DIRECTORY = new Directory(Paths.document, 'SQLite');
const RXDB_DIRECTORY_PREFIX = 'rxdb-';

export interface PurgeLegacyDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

const deleteLegacySQLiteDatabases = (directory: Directory) => {
	dbLogger.debug(`Checking SQLite database directory: ${directory.uri}`);

	if (!directory.exists) {
		dbLogger.debug('SQLite database directory does not exist');
		return 0;
	}

	// `Documents/SQLite` is expo-sqlite's SHARED directory, not a WCPOS-owned one,
	// so name what goes: legacy WCPOS databases and their sidecars. Removing the
	// directory wholesale also took anything else living there, and reported a
	// flat 1 — which the cashier reads as "purged 1 legacy database entries".
	// The live root (`Documents/wcpos-sqlite`) gets the same by-name pass: since the
	// 2.0 schema reset a retired generation (`v8`/`v9`) lives beside the current one.
	const legacyEntries = directory.list().filter((entry) => isLegacyAppDatabaseName(entry.name));

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
	if (!EXPO_OPFS_ROOT.exists) {
		dbLogger.debug('Expo OPFS root does not exist');
		return 0;
	}

	// The entire retired engine root is WCPOS-owned, including current-generation remnants.
	const count = EXPO_OPFS_ROOT.list().filter((item) =>
		item.name.startsWith(RXDB_DIRECTORY_PREFIX)
	).length;
	EXPO_OPFS_ROOT.delete();
	return count;
};

export const purgeLegacyDatabases = async (): Promise<PurgeLegacyDBResult> => {
	try {
		dbLogger.debug('Starting to purge legacy application databases');
		const deletedSQLiteDatabases =
			deleteLegacySQLiteDatabases(LEGACY_SQLITE_DIRECTORY) +
			deleteLegacySQLiteDatabases(NATIVE_SQLITE_ROOT);
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
