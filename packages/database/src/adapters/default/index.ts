import * as SQLite from 'expo-sqlite';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';

import type { SQLiteBasics } from 'rxdb-premium/plugins/storage-sqlite';

// Keep a cache of database connections keyed by database name
const dbCache = new Map<string, any>();

// Function to close all database connections
async function closeAllDatabases() {
	console.log('Closing all database connections');
	for (const [dbName, db] of dbCache.entries()) {
		try {
			await db.closeAsync();
			console.log(`Closed database: ${dbName}`);
		} catch (err) {
			console.warn(`Failed to close database: ${dbName}`, err);
		}
	}
	// Clear the cache after closing
	dbCache.clear();
}

// Utility function to handle database operations with retries
async function withDatabaseRetry<T>(
	db: any,
	operation: () => Promise<T>,
	operationName: string
): Promise<T> {
	const maxRetries = 3;
	let lastError;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const errorMessage = error.message || '';
			const isConnectionError =
				errorMessage.includes('already released') || errorMessage.includes('database is locked');

			if (isConnectionError && attempt < maxRetries - 1) {
				console.warn(`Database ${operationName} error, attempt ${attempt + 1}/${maxRetries}`);
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));

				// Try to refresh the connection if it's in the cache
				for (const [key, cachedDb] of dbCache.entries()) {
					if (cachedDb === db) {
						dbCache.delete(key);
						db = await getSQLiteBasicsExpoSQLiteAsync().open(key);
						break;
					}
				}
				continue;
			}

			console.error(`Database ${operationName} error:`, error);
			throw error;
		}
	}

	throw lastError;
}

// For development environments, add a cleanup listener
if (__DEV__) {
	// In Expo/React Native, we can use the AppState API to detect app background/foreground
	// but for direct HMR detection, we can look for module replacements

	// This is a simple workaround to detect module reloads - when this module is reloaded,
	// the old instance's cleanup code will run, helping to close connections
	if (global.__EXPO_SQLITE_CONNECTION_CLEANUP__) {
		// Previous instance exists, run its cleanup
		try {
			global.__EXPO_SQLITE_CONNECTION_CLEANUP__();
		} catch (e) {
			console.warn('Error during previous connection cleanup', e);
		}
	}

	// Store our cleanup function globally so next HMR reload can access it
	global.__EXPO_SQLITE_CONNECTION_CLEANUP__ = closeAllDatabases;
}

function getSQLiteBasicsExpoSQLiteAsync(): SQLiteBasics<any> {
	return {
		open: async (databaseName) => {
			// If we have a cached connection, validate it first
			if (dbCache.has(databaseName)) {
				const cachedDb = dbCache.get(databaseName);
				try {
					// Test the connection with a simple query
					await cachedDb.getAllAsync('SELECT 1');
					return cachedDb;
				} catch (error) {
					// Connection is invalid, remove it from cache
					console.warn(`Invalid cached connection for ${databaseName}, creating new one`);
					dbCache.delete(databaseName);
					// Continue to open new connection
				}
			}

			try {
				// Open a new connection with the useNewConnection option
				console.log(`Opening new database connection: ${databaseName}`);
				const db = await SQLite.openDatabaseAsync(databaseName, {
					useNewConnection: true,
				});

				// Configure database for better concurrency
				await db.execAsync(`
					PRAGMA journal_mode = WAL;
					PRAGMA synchronous = NORMAL;
					PRAGMA foreign_keys = ON;
					PRAGMA busy_timeout = 15000;
				`);

				// Cache the connection
				dbCache.set(databaseName, db);
				return db;
			} catch (error) {
				console.error(`Failed to open database: ${databaseName}`, error);
				throw error;
			}
		},

		all: async (db, queryObject) => {
			return withDatabaseRetry(
				db,
				() => db.getAllAsync(queryObject.query, queryObject.params),
				'all'
			);
		},

		run: async (db, queryObject) => {
			return withDatabaseRetry(db, () => db.runAsync(queryObject.query, queryObject.params), 'run');
		},

		setPragma: async (db, pragmaKey, pragmaValue) => {
			return withDatabaseRetry(
				db,
				() => db.execAsync(`PRAGMA ${pragmaKey} = ${pragmaValue}`),
				'setPragma'
			);
		},

		close: async (db) => {
			try {
				// Remove from cache before closing
				for (const [key, cachedDb] of dbCache.entries()) {
					if (cachedDb === db) {
						dbCache.delete(key);
						break;
					}
				}

				await db.closeAsync();
			} catch (error) {
				console.error('Error closing database:', error);

				// Still remove from cache even if close fails
				for (const [key, cachedDb] of dbCache.entries()) {
					if (cachedDb === db) {
						dbCache.delete(key);
						break;
					}
				}
			}
		},

		journalMode: 'WAL', // Specify that we're using WAL journal mode
	};
}

export const storage = getRxStorageSQLite({
	sqliteBasics: getSQLiteBasicsExpoSQLiteAsync(),
});

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // must be false for react native
	ignoreDuplicate: !!__DEV__,
};
