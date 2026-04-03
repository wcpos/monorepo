import { Directory, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { closeAllDatabases, dbCache } from './adapters/default';
import { closeAllLegacyNativeDatabases } from './migration/storage';
import {
	APP_DATABASE_PREFIXES,
	isKnownAppDatabaseName,
	USER_DATABASE_NAMES,
} from './migration/storage/database-names';

const dbLogger = getLogger(['wcpos', 'db', 'clear']);
const EXPO_OPFS_ROOT = new Directory(Paths.document, '.expo-opfs');
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

const isMissingSQLiteDatabaseError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	const normalizedMessage = message.toLowerCase();

	return normalizedMessage.includes('not exist') || normalizedMessage.includes('no such');
};

const deleteKnownSQLiteDatabase = async (dbName: string) => {
	try {
		dbLogger.debug(`Attempting to delete SQLite database: ${dbName}`);
		await SQLite.deleteDatabaseAsync(dbName);
		return true;
	} catch (error) {
		if (isMissingSQLiteDatabaseError(error)) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			dbLogger.debug(`SQLite database ${dbName} was already absent: ${errorMessage}`);
			return false;
		}

		throw error;
	}
};

const deleteLegacySQLiteDatabases = async () => {
	let deletedCount = 0;
	const knownDatabases = Object.values(USER_DATABASE_NAMES);

	for (const dbName of knownDatabases) {
		if (await deleteKnownSQLiteDatabase(dbName)) {
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
		const appDatabaseFiles = fileNames.filter((file) => {
			if (file.endsWith('-wal') || file.endsWith('-shm')) {
				return false;
			}

			return isKnownAppDatabaseName(file);
		});

		for (const fileName of appDatabaseFiles) {
			if (knownDatabases.includes(fileName)) {
				continue;
			}

			if (await deleteKnownSQLiteDatabase(fileName)) {
				deletedCount++;
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		dbLogger.debug(`Could not access SQLite database directory: ${errorMessage}`);
	}

	return deletedCount;
};

const deleteFilesystemDatabases = () => {
	if (!EXPO_OPFS_ROOT.exists) {
		dbLogger.debug('Expo OPFS root does not exist');
		return 0;
	}

	const contents = EXPO_OPFS_ROOT.list();
	const appEntries = contents.filter((item) => isKnownAppFilesystemEntry(item.name));

	for (const entry of appEntries) {
		dbLogger.debug(`Deleting filesystem-backed database entry: ${entry.name}`);
		entry.delete();
	}

	return appEntries.length;
};

export const clearAllDB = async (): Promise<ClearDBResult> => {
	try {
		dbLogger.debug('Starting to clear all application databases');
		// Expo filesystem/OPFS storage does not use the old SQLite-style connection cache here.
		dbLogger.debug(`Closing ${dbCache.size} cached database connections`);
		await closeAllDatabases();
		// The only explicit native handles we still close are legacy SQLite migration connections.
		dbLogger.debug('Closing cached legacy SQLite migration connections');
		await closeAllLegacyNativeDatabases();

		const deletedSQLiteDatabases = await deleteLegacySQLiteDatabases();
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
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.TRANSACTION_FAILED,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
};
