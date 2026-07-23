import { Directory, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { isLegacyAppDatabaseName, LEGACY_USER_DATABASE_NAMES } from './database-names';

const dbLogger = getLogger(['wcpos', 'db', 'purge-legacy']);
const EXPO_OPFS_ROOT = new Directory(Paths.document, '.expo-opfs');
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

const isMissingSQLiteDatabaseError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	const normalizedMessage = message.toLowerCase();

	return normalizedMessage.includes('not exist') || normalizedMessage.includes('no such');
};

const deleteLegacySQLiteDatabase = async (dbName: string) => {
	try {
		dbLogger.debug(`Attempting to delete legacy SQLite database: ${dbName}`);
		await SQLite.deleteDatabaseAsync(dbName);
		return true;
	} catch (error) {
		if (isMissingSQLiteDatabaseError(error)) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			dbLogger.debug(`Legacy SQLite database ${dbName} was already absent: ${errorMessage}`);
			return false;
		}

		throw error;
	}
};

const deleteLegacySQLiteDatabases = async () => {
	let deletedCount = 0;
	const knownDatabases: readonly string[] = LEGACY_USER_DATABASE_NAMES;

	for (const dbName of knownDatabases) {
		if (await deleteLegacySQLiteDatabase(dbName)) {
			deletedCount++;
		}
	}

	try {
		const databaseDirectory = new Directory(SQLite.defaultDatabaseDirectory);
		dbLogger.debug(`Checking SQLite database directory: ${databaseDirectory.uri}`);

		if (!databaseDirectory.exists) {
			dbLogger.debug('SQLite database directory does not exist');
			return deletedCount;
		}

		const contents = databaseDirectory.list();
		const fileNames = contents.map((item) => item.name);
		const legacyDatabaseFiles = fileNames.filter((file) => {
			if (file.endsWith('-wal') || file.endsWith('-shm')) {
				return false;
			}

			return isLegacyAppDatabaseName(file);
		});

		for (const fileName of legacyDatabaseFiles) {
			if (knownDatabases.includes(fileName)) {
				continue;
			}

			if (await deleteLegacySQLiteDatabase(fileName)) {
				deletedCount++;
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		dbLogger.debug(`Could not access SQLite database directory: ${errorMessage}`);
	}

	return deletedCount;
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
		const deletedSQLiteDatabases = await deleteLegacySQLiteDatabases();
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
