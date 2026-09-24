import { openDatabaseAsync } from 'expo-sqlite';
import { getSQLiteBasicsExpoSQLiteAsync } from 'rxdb-premium/plugins/storage-sqlite';
export function sqliteBasicsExpo(directory: string) {
	// useNewConnection makes the independent WAL/integrity proof an actual second connection.
	const shipped = getSQLiteBasicsExpoSQLiteAsync(
		openDatabaseAsync,
		{ useNewConnection: true },
		directory
	);
	return {
		...shipped,
		journalMode: 'WAL' as const,
		async open(name: string) {
			const db = await shipped.open(name);
			await db.execAsync('PRAGMA journal_mode = WAL');
			await db.execAsync('PRAGMA synchronous = NORMAL');
			return db;
		},
	};
}
