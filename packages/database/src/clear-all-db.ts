import { Directory } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { closeAllDatabases, dbCache } from './adapters/default';

const dbLogger = getLogger(['wcpos', 'db', 'clear']);

export interface ClearDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

/**
 * Completely wipes all SQLite databases used by the app
 *
 * This function:
 * 1. Closes all open database connections first (required before deletion)
 * 2. Uses Expo SQLite's built-in deleteDatabaseAsync for known databases
 * 3. Falls back to directory listing + deletion for unknown databases
 *
 * Note: The "temporary" database uses in-memory storage and doesn't need SQLite deletion.
 *
 * Based on the Expo SQLite docs: https://docs.expo.dev/versions/latest/sdk/sqlite/
 *
 * @returns Promise<ClearDBResult> - Information about the clearing operation
 */
export const clearAllDB = async (): Promise<ClearDBResult> => {
	try {
		dbLogger.debug('Starting to clear all SQLite databases');

		// Step 1: Close all open database connections first
		// Databases must be closed before they can be deleted
		dbLogger.debug(`Closing ${dbCache.size} cached database connections`);
		await closeAllDatabases();

		let deletedCount = 0;

		// Step 2: Try to delete known database names from create-db.ts
		// Note: "temporary" database uses memory storage, not SQLite, so it's not included
		const knownDatabases = ['wcposusers_v2'];

		for (const dbName of knownDatabases) {
			try {
				dbLogger.debug(`Attempting to delete known database: ${dbName}`);
				await SQLite.deleteDatabaseAsync(dbName);
				deletedCount++;
				dbLogger.debug(`Successfully deleted database: ${dbName}`);
			} catch (error) {
				// Database might not exist, which is fine
				const errorMessage = error instanceof Error ? error.message : String(error);
				dbLogger.debug(
					`Could not delete database ${dbName}: ${errorMessage || 'Database does not exist'}`
				);
			}
		}

		// Step 3: Try to find and delete store databases by checking the directory
		// This handles the dynamic store_v2_{id} and fast_store_v3_{id} databases
		try {
			const databaseDirectory = SQLite.defaultDatabaseDirectory;
			dbLogger.debug(`Checking database directory: ${databaseDirectory}`);

			const directory = new Directory(databaseDirectory);

			if (directory.exists) {
				const contents = await directory.list();
				const fileNames = contents.map((item) => item.name);
				dbLogger.debug(`Found ${fileNames.length} files in database directory`);

				// Filter for files that look like our app's databases
				const appDatabaseFiles = fileNames.filter((file) => {
					// Skip auxiliary files like -wal and -shm
					if (file.endsWith('-wal') || file.endsWith('-shm')) {
						return false;
					}

					// Include files that match our database naming patterns
					return (
						file.startsWith('wcposusers_') ||
						file.startsWith('store_v2_') ||
						file.startsWith('fast_store_v3_')
					);
				});

				dbLogger.debug(
					`Found ${appDatabaseFiles.length} app database files: ${JSON.stringify(appDatabaseFiles)}`
				);

				// Try to delete each database file using SQLite's method
				for (const fileName of appDatabaseFiles) {
					// Skip if we already tried this database
					if (knownDatabases.includes(fileName)) {
						continue;
					}

					try {
						dbLogger.debug(`Attempting to delete discovered database: ${fileName}`);
						await SQLite.deleteDatabaseAsync(fileName);
						deletedCount++;
						dbLogger.debug(`Successfully deleted database: ${fileName}`);
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						dbLogger.debug(`Could not delete database ${fileName}: ${errorMessage}`);
					}
				}
			} else {
				dbLogger.debug('Database directory does not exist (no databases have been created yet)');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			dbLogger.debug(`Could not access database directory: ${errorMessage}`);
			// This is not a fatal error, we can still report success for known databases
		}

		const message =
			deletedCount > 0
				? `Successfully cleared ${deletedCount} databases`
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
