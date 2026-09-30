import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import {
	getRxStorageSQLite,
	getSQLiteBasicsExpoSQLiteAsync,
} from 'rxdb-premium/plugins/storage-sqlite';

import { NATIVE_SQLITE_ROOT } from './sqlite-root';
import {
	STORAGE_TIMING_PROBE_ENABLED,
	withStorageTimingProbe,
} from '../../plugins/storage-timing-probe';

export function getNativeNewStorage() {
	const basics = getSQLiteBasicsExpoSQLiteAsync((name: string) =>
		openDatabaseAsync(name, undefined, NATIVE_SQLITE_ROOT.uri)
	);
	const rawStorage = getRxStorageSQLite({
		storeAttachmentsAsBase64String: true,
		sqliteBasics: {
			...basics,
			journalMode: 'WAL',
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
