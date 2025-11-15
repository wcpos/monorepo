import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

import log from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

export interface ClearDBResult {
	success: boolean;
	message: string;
	databasesDeleted: number;
}

/**
 * Completely wipes all SQLite databases used by the app
 *
 * This function combines the best of both approaches:
 * 1. Uses Expo SQLite's built-in deleteDatabaseAsync for known databases
 * 2. Falls back to directory listing + deletion for unknown databases
 *
 * Based on the Expo SQLite docs: https://docs.expo.dev/versions/latest/sdk/sqlite/
 *
 * @returns Promise<ClearDBResult> - Information about the clearing operation
 */
export const clearAllDB = async (): Promise<ClearDBResult> => {
	try {
		log.debug('Starting to clear all SQLite databases');

		let deletedCount = 0;

		// Step 1: Try to delete known database names from create-db.ts
		const knownDatabases = ['wcposusers_v2', 'temporary_v2'];

		for (const dbName of knownDatabases) {
			try {
				log.debug(`Attempting to delete known database: ${dbName}`);
				await SQLite.deleteDatabaseAsync(dbName);
				deletedCount++;
				log.debug(`Successfully deleted database: ${dbName}`);
			} catch (error) {
				// Database might not exist, which is fine
				log.debug(`Could not delete database ${dbName} (likely doesn't exist):`, error);
			}
		}

		// Step 2: Try to find and delete store databases by checking the directory
		// This handles the dynamic store_v2_{id} and fast_store_v3_{id} databases
		try {
			const databaseDirectory = SQLite.defaultDatabaseDirectory;
			log.debug(`Checking database directory: ${databaseDirectory}`);

			const dirInfo = await FileSystem.getInfoAsync(databaseDirectory);
			if (dirInfo.exists) {
				const files = await FileSystem.readDirectoryAsync(databaseDirectory);
				log.debug(`Found ${files.length} files in database directory`);

				// Filter for files that look like our app's databases
				const appDatabaseFiles = files.filter((file) => {
					// Skip auxiliary files like -wal and -shm
					if (file.endsWith('-wal') || file.endsWith('-shm')) {
						return false;
					}

					// Include files that match our database naming patterns
					return (
						file.startsWith('wcposusers_') ||
						file.startsWith('store_v2_') ||
						file.startsWith('fast_store_v3_') ||
						file.startsWith('temporary_')
					);
				});

				log.debug(
					`Found ${appDatabaseFiles.length} app database files: ${JSON.stringify(appDatabaseFiles)}`
				);

				// Try to delete each database file using SQLite's method
				for (const fileName of appDatabaseFiles) {
					// Skip if we already tried this database
					if (knownDatabases.includes(fileName)) {
						continue;
					}

					try {
						log.debug(`Attempting to delete discovered database: ${fileName}`);
						await SQLite.deleteDatabaseAsync(fileName);
						deletedCount++;
						log.debug(`Successfully deleted database: ${fileName}`);
					} catch (error) {
						log.debug(`Could not delete database ${fileName}:`, error);
					}
				}
			} else {
				log.debug('Database directory does not exist');
			}
		} catch (error) {
			log.debug('Could not access database directory:', error);
			// This is not a fatal error, we can still report success for known databases
		}

		const message =
			deletedCount > 0
				? `Successfully cleared ${deletedCount} databases`
				: 'No databases found to clear (this might mean the app is already in a clean state)';

		log.debug(message);

		return {
			success: true,
			message,
			databasesDeleted: deletedCount,
		};
	} catch (error) {
		log.error('Failed to clear databases', {
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
