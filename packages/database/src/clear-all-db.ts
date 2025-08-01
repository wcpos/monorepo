import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

import log from '@wcpos/utils/logger';

/**
 * Completely wipes all expo-sqlite databases
 *
 * This function attempts to:
 * 1. Discover all database files in the default database directory
 * 2. Aggressively close all database connections with WAL checkpointing
 * 3. Delete databases using SQLite's deleteDatabaseAsync
 * 4. Fallback to direct file system deletion if SQLite deletion fails
 *
 * The fallback is necessary because other parts of the application
 * (like RxDB) may maintain persistent connections that prevent SQLite
 * from deleting the database files normally.
 */
export const clearAllDB = async (): Promise<void> => {
	try {
		log.debug('Starting to clear all SQLite databases');

		// Get the default database directory
		const databaseDirectory = SQLite.defaultDatabaseDirectory;
		log.debug(`Database directory: ${databaseDirectory}`);

		// Check if the database directory exists
		const dirInfo = await FileSystem.getInfoAsync(databaseDirectory);
		if (!dirInfo.exists) {
			log.debug('Database directory does not exist, nothing to clean');
			return;
		}

		// List all files in the database directory
		const files = await FileSystem.readDirectoryAsync(databaseDirectory);
		log.debug(`Found ${files.length} files in database directory`);

		if (files.length === 0) {
			log.debug('No database files found to delete');
			return;
		}

		// Filter for database files (SQLite databases typically end with .db, but can have other extensions or none)
		// We'll be more inclusive and delete any file that looks like it could be a database
		const databaseFiles = files.filter((file) => {
			// Include files with common database extensions or no extension
			return (
				file.includes('wcpos') || // Our app-specific databases
				file.includes('store') || // Store databases
				file.includes('sync') || // Sync databases
				file.includes('temp') || // Temporary databases
				file.endsWith('.db') || // Standard SQLite extension
				file.endsWith('.sqlite') || // Alternative SQLite extension
				file.endsWith('.sqlite3') || // Another SQLite extension
				(!file.includes('.') && file.length > 0) // Files without extension (common for SQLite)
			);
		});

		log.debug(
			`Found ${databaseFiles.length} potential database files to delete: ${JSON.stringify(databaseFiles)}`
		);

		// First, close all open database connections
		// Filter out WAL and SHM files as these are SQLite auxiliary files, not actual databases
		const mainDatabaseFiles = databaseFiles.filter(
			(file) => !file.endsWith('-wal') && !file.endsWith('-shm')
		);

		log.debug(`Attempting to close ${mainDatabaseFiles.length} main database files`);

		// Try to open and close each database multiple times to ensure it's properly closed
		// This helps work around database caching issues
		for (const fileName of mainDatabaseFiles) {
			try {
				// Try multiple times with different connection options
				for (let attempt = 0; attempt < 3; attempt++) {
					try {
						const db = await SQLite.openDatabaseAsync(fileName, {
							useNewConnection: true, // Force new connection to bypass cache
						});

						// Try to aggressively close WAL mode and force checkpointing
						try {
							await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
							await db.execAsync('PRAGMA journal_mode = DELETE;');
						} catch (pragmaError) {
							// PRAGMA commands might fail, that's okay
							log.debug(`PRAGMA commands failed for ${fileName}:`, pragmaError);
						}

						await db.closeAsync();
						log.debug(`Closed database: ${fileName} (attempt ${attempt + 1})`);

						// Small delay between attempts
						await new Promise((resolve) => setTimeout(resolve, 50));
					} catch (attemptError) {
						log.debug(`Attempt ${attempt + 1} failed for ${fileName}:`, attemptError);
					}
				}
			} catch (error) {
				// Database might not exist or might already be closed, that's okay
				log.debug(
					`Could not open/close database ${fileName} (might not exist or already closed):`,
					error
				);
			}
		}

		// Longer delay to ensure all connections are fully closed and caches are cleared
		log.debug('Waiting for database connections to fully close...');
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Delete all database files with retry logic and fallback to direct file deletion
		const deletePromises = databaseFiles.map(async (fileName) => {
			// Try to delete with retries for databases that might still be locked
			for (let deleteAttempt = 0; deleteAttempt < 3; deleteAttempt++) {
				try {
					// Use deleteDatabaseAsync with just the filename (no directory path)
					await SQLite.deleteDatabaseAsync(fileName);
					log.debug(`Successfully deleted database: ${fileName}`);
					return; // Success, exit retry loop
				} catch (error) {
					if (deleteAttempt < 2) {
						// Not the last attempt, wait and retry
						log.debug(`Delete attempt ${deleteAttempt + 1} failed for ${fileName}, retrying...`);
						await new Promise((resolve) => setTimeout(resolve, 200 * (deleteAttempt + 1)));
					} else {
						// Last attempt with SQLite failed, try direct file system deletion as fallback
						log.warn(
							`SQLite deletion failed for ${fileName}, trying direct file deletion. Error:`,
							error
						);
						try {
							const filePath = `${databaseDirectory}/${fileName}`;
							const fileInfo = await FileSystem.getInfoAsync(filePath);
							if (fileInfo.exists) {
								await FileSystem.deleteAsync(filePath, { idempotent: true });
								log.debug(`Successfully deleted ${fileName} using direct file deletion`);
							} else {
								log.debug(`File ${fileName} doesn't exist, considering it deleted`);
							}
						} catch (fileError) {
							log.warn(`Both SQLite and direct file deletion failed for ${fileName}:`, fileError);
						}
					}
				}
			}
		});

		await Promise.all(deletePromises);

		log.debug(
			`Completed clearing all SQLite databases. Attempted to delete ${databaseFiles.length} files`
		);
	} catch (error) {
		log.error('Failed to clear all databases:', error);
		throw error;
	}
};
