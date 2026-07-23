import { Directory, Paths } from 'expo-file-system';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

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

	LEGACY_SQLITE_DIRECTORY.delete();
	return 1;
};

const deleteLegacyFilesystemDatabases = () => {
	if (!EXPO_OPFS_ROOT.exists) {
		dbLogger.debug('Expo OPFS root does not exist');
		return 0;
	}

	const contents = EXPO_OPFS_ROOT.list();
	const legacyEntries = contents.filter((item) => isLegacyAppFilesystemEntry(item.name));

	for (const entry of legacyEntries) {
		dbLogger.debug(`Deleting legacy filesystem-backed database entry: ${entry.name}`);
		entry.delete();
	}

	return legacyEntries.length;
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
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.TRANSACTION_FAILED,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
};
