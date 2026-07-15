import * as SQLite from 'expo-sqlite';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';

import type { SQLiteBasics } from 'rxdb-premium/plugins/storage-sqlite';

type NativeSQLiteDatabase = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;

const nativeDbCache = new Map<string, NativeSQLiteDatabase>();

async function withDatabaseRetry<T>(
	db: NativeSQLiteDatabase,
	operation: (activeDb: NativeSQLiteDatabase) => Promise<T>
): Promise<T> {
	const maxRetries = 3;
	let lastError: unknown;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await operation(db);
		} catch (error) {
			lastError = error;
			const errorMessage = error instanceof Error ? error.message : String(error);
			const isConnectionError =
				errorMessage.includes('already released') || errorMessage.includes('database is locked');

			if (isConnectionError && attempt < maxRetries - 1) {
				await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));

				for (const [key, cachedDb] of nativeDbCache.entries()) {
					if (cachedDb === db) {
						nativeDbCache.delete(key);
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

export function getSQLiteBasicsExpoSQLiteAsync(): SQLiteBasics<NativeSQLiteDatabase> {
	return {
		open: async (databaseName) => {
			const cachedDb = nativeDbCache.get(databaseName);
			if (cachedDb) {
				try {
					await cachedDb.getAllAsync('SELECT 1');
					return cachedDb;
				} catch {
					nativeDbCache.delete(databaseName);
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

			nativeDbCache.set(databaseName, db);
			return db;
		},
		all: async (db, queryObject) => {
			return withDatabaseRetry(db, (activeDb) =>
				activeDb.getAllAsync(queryObject.query, queryObject.params)
			);
		},
		run: async (db, queryObject) => {
			await withDatabaseRetry(db, (activeDb) =>
				activeDb.runAsync(queryObject.query, queryObject.params)
			);
		},
		setPragma: async (db, pragmaKey, pragmaValue) => {
			return withDatabaseRetry(db, (activeDb) =>
				activeDb.execAsync(`PRAGMA ${pragmaKey} = ${pragmaValue}`)
			);
		},
		close: async (db) => {
			for (const [key, cachedDb] of nativeDbCache.entries()) {
				if (cachedDb === db) {
					nativeDbCache.delete(key);
					break;
				}
			}

			try {
				await db.closeAsync();
			} catch {
				// Best-effort cleanup for cached SQLite access.
			}
		},
		journalMode: 'WAL',
	};
}

export async function closeAllCachedNativeDatabases() {
	const closePromises = Array.from(nativeDbCache.values()).map(async (db) => {
		try {
			await db.closeAsync();
		} catch {
			// Best-effort cleanup for cached SQLite access.
		}
	});

	nativeDbCache.clear();
	await Promise.all(closePromises);
}

export function getNativeNewStorage() {
	return getRxStorageSQLite({
		sqliteBasics: getSQLiteBasicsExpoSQLiteAsync(),
	});
}
