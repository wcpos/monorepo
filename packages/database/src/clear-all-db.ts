import { Directory, Paths } from 'expo-file-system';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { APP_DATABASE_PREFIXES } from './database-names';

const dbLogger = getLogger(['wcpos', 'db', 'clear']);
const OPFS_ROOTS = ['.expo-opfs', '.worklet-opfs'].map(
	(root) => new Directory(Paths.document, root)
);
const LEGACY_SQLITE_DIRECTORY = new Directory(Paths.document, 'SQLite');
const RXDB_DIRECTORY_PREFIX = 'rxdb-';

export interface ClearDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

const toFilesystemSafeName = (value: string) => value.replace(/\//g, '__');

const isKnownAppFilesystemEntry = (name: string) =>
	APP_DATABASE_PREFIXES.map(toFilesystemSafeName).some((prefix) =>
		name.startsWith(`${RXDB_DIRECTORY_PREFIX}${prefix}`)
	);

const deleteLegacySQLiteDatabases = () => {
	dbLogger.debug(`Checking SQLite database directory: ${LEGACY_SQLITE_DIRECTORY.uri}`);

	if (!LEGACY_SQLITE_DIRECTORY.exists) {
		dbLogger.debug('SQLite database directory does not exist');
		return 0;
	}

	LEGACY_SQLITE_DIRECTORY.delete();
	return 1;
};

const deleteFilesystemDatabases = () => {
	let deleted = 0;
	for (const root of OPFS_ROOTS) {
		if (!root.exists) continue;
		const contents = root.list();
		const appEntries = contents.filter((item) => isKnownAppFilesystemEntry(item.name));

		for (const entry of appEntries) {
			dbLogger.debug(`Deleting filesystem-backed database entry: ${entry.name}`);
			entry.delete();
		}
		deleted += appEntries.length;
	}
	return deleted;
};

export const clearAllDB = async (): Promise<ClearDBResult> => {
	try {
		dbLogger.debug('Starting to clear all application databases');
		const deletedSQLiteDatabases = deleteLegacySQLiteDatabases();
		const deletedFilesystemDatabases = deleteFilesystemDatabases();
		const deletedCount = deletedSQLiteDatabases + deletedFilesystemDatabases;

		const message =
			deletedCount > 0
				? `Successfully cleared ${deletedCount} database entries`
				: 'No databases found to clear (this might mean the app is already in a clean state)';

		dbLogger.info(message);

		return {
			success: true,
			message,
			databasesDeleted: deletedCount,
		};
	} catch (error) {
		dbLogger.error('Failed to clear databases', {
			showToast: true,
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
};
