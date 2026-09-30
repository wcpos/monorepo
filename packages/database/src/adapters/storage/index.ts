import {
	openDatabaseAsync,
	type SQLiteBindParams,
	type SQLiteDatabase,
	type SQLiteStatement,
} from 'expo-sqlite';
import {
	getRxStorageSQLite,
	getSQLiteBasicsExpoSQLiteAsync,
	type SQLiteQueryWithParams,
	type SQLResultRow,
} from 'rxdb-premium/plugins/storage-sqlite';

import { NATIVE_SQLITE_ROOT } from './sqlite-root';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';

// expo-sqlite's runAsync/getAllAsync finalize the statement in a bare
// `finally`. When the step failed, sqlite3_finalize returns that same error
// code, expo-sqlite throws again from the finalizer, and a throw inside
// `finally` REPLACES the error being propagated. By then the connection's
// message has been reset by whatever statement ran in between on the shared
// connection, so what reaches the caller is
//   "SQLiteErrorException: Error code 0: not an error (NativeStatement.swift:89)"
// and the real failure is gone. Premium's bulkWrite depends on seeing it: the
// optimistic INSERT of an already-present document is caught on
// "UNIQUE constraint" / "SQLITE_CONSTRAINT" and retried as ON CONFLICT DO
// UPDATE — the sync engine's ordinary insert-or-update path. Masked, premium
// rethrows and the whole batch fails; the first iOS device run (2026-09-30)
// logged 62 failed bulkWrites and ~120 failed sync requirements on products
// and variations, which were being written concurrently. Single writes were
// fine, which is why no unit seam caught it.
//
// So prepare, execute and finalize explicitly: a finalizer error after a
// successful execute is real and propagates; after a failed execute it is
// noise and the execute error wins.
async function withStatement<T>(
	db: SQLiteDatabase,
	{ query }: SQLiteQueryWithParams,
	body: (statement: SQLiteStatement) => Promise<T>
): Promise<T> {
	const statement = await db.prepareAsync(query);
	let result: T;
	try {
		result = await body(statement);
	} catch (error) {
		try {
			await statement.finalizeAsync();
		} catch {
			// the execute error is the one that carries the SQLite message
		}
		throw error;
	}
	await statement.finalizeAsync();
	return result;
}

export function getNativeNewStorage() {
	const basics = getSQLiteBasicsExpoSQLiteAsync((name: string) =>
		openDatabaseAsync(name, undefined, NATIVE_SQLITE_ROOT.uri)
	);
	const rawStorage = getRxStorageSQLite({
		storeAttachmentsAsBase64String: true,
		sqliteBasics: {
			...basics,
			journalMode: 'WAL',
			all: (db: SQLiteDatabase, queryWithParams: SQLiteQueryWithParams) =>
				withStatement(db, queryWithParams, async (statement) => {
					const executed = await statement.executeAsync<SQLResultRow>(
						queryWithParams.params as SQLiteBindParams
					);
					return executed.getAllAsync();
				}),
			run: (db: SQLiteDatabase, queryWithParams: SQLiteQueryWithParams) =>
				withStatement(db, queryWithParams, async (statement) => {
					await statement.executeAsync(queryWithParams.params as SQLiteBindParams);
				}),
			async open(name: string) {
				const db: SQLiteDatabase = await basics.open(name);
				await db.execAsync('PRAGMA journal_mode = WAL');
				const mode = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
				if (mode?.journal_mode !== 'wal') {
					throw new Error(`Native SQLite requires WAL; received ${mode?.journal_mode}`);
				}
				await db.execAsync('PRAGMA synchronous = NORMAL');
				return db;
			},
		},
	});
	return STORAGE_TIMING_PROBE_ENABLED ? withStorageTimingProbe(rawStorage, 'raw') : rawStorage;
}
