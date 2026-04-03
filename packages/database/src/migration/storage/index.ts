import * as SQLite from 'expo-sqlite';
import { getRxStorageExpoAsync } from 'rxdb-premium/plugins/storage-filesystem-expo';

import { getLegacyMigrationRxStorageSQLite } from './legacy-sqlite-storage';

import type { SQLiteBasics } from 'rxdb-premium-old/plugins/storage-sqlite';
import type { StorageMigrationConfig, StorageMigrationDatabaseKind } from './types';

export { prepareOldDatabaseForStorageMigration } from './prepare-old-database';

const NATIVE_STORAGE_KIND = 'expo-filesystem' as const;
const legacyDbCache = new Map<string, any>();

async function withDatabaseRetry<T>(db: any, operation: () => Promise<T>): Promise<T> {
	const maxRetries = 3;
	let lastError: unknown;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isConnectionError =
				errorMessage.includes('already released') || errorMessage.includes('database is locked');

			if (isConnectionError && attempt < maxRetries - 1) {
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));

				for (const [key, cachedDb] of legacyDbCache.entries()) {
					if (cachedDb === db) {
						legacyDbCache.delete(key);
						db = await getSQLiteBasicsExpoSQLiteAsync().open(key);
						break;
					}
				}
				continue;
			}

			throw error;
		}
	}

	throw lastError;
}

function getSQLiteBasicsExpoSQLiteAsync(): SQLiteBasics<any> {
	return {
		open: async (databaseName) => {
			if (legacyDbCache.has(databaseName)) {
				const cachedDb = legacyDbCache.get(databaseName);
				try {
					await cachedDb.getAllAsync('SELECT 1');
					return cachedDb;
				} catch {
					legacyDbCache.delete(databaseName);
				}
			}

			const db = await SQLite.openDatabaseAsync(databaseName, {
				useNewConnection: true,
			});

			await db.execAsync(`
				PRAGMA journal_mode = WAL;
				PRAGMA synchronous = NORMAL;
				PRAGMA foreign_keys = ON;
				PRAGMA busy_timeout = 15000;
			`);

			legacyDbCache.set(databaseName, db);
			return db;
		},
		all: async (db, queryObject) => {
			return withDatabaseRetry(db, () => db.getAllAsync(queryObject.query, queryObject.params));
		},
		run: async (db, queryObject) => {
			return withDatabaseRetry(db, () => db.runAsync(queryObject.query, queryObject.params));
		},
		setPragma: async (db, pragmaKey, pragmaValue) => {
			return withDatabaseRetry(db, () => db.execAsync(`PRAGMA ${pragmaKey} = ${pragmaValue}`));
		},
		close: async (db) => {
			for (const [key, cachedDb] of legacyDbCache.entries()) {
				if (cachedDb === db) {
					legacyDbCache.delete(key);
					break;
				}
			}

			try {
				await db.closeAsync();
			} catch {
				// Best-effort cleanup for migration-only legacy SQLite access.
			}
		},
		journalMode: 'WAL',
	};
}

export async function closeAllLegacyNativeDatabases() {
	const closePromises = Array.from(legacyDbCache.values()).map(async (db) => {
		try {
			await db.closeAsync();
		} catch {
			// Best-effort cleanup for migration-only legacy SQLite access.
		}
	});

	legacyDbCache.clear();
	await Promise.all(closePromises);
}

export function getNativeStorageKind() {
	return NATIVE_STORAGE_KIND;
}

export function getNativeOldStorage() {
	return getLegacyMigrationRxStorageSQLite({
		sqliteBasics: getSQLiteBasicsExpoSQLiteAsync(),
	});
}

export function getNativeNewStorage() {
	return getRxStorageExpoAsync();
}

export function getStorageMigrationConfig(
	_databaseKind: StorageMigrationDatabaseKind
): StorageMigrationConfig {
	return {
		oldStorage: getNativeOldStorage(),
		sourceStorage: 'expo-sqlite',
		targetStorage: 'expo-filesystem',
	};
}
