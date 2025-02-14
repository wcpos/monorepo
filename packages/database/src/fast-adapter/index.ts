import * as SQLite from 'expo-sqlite';
import {
	getRxStorageSQLite,
	getSQLiteBasicsExpoSQLiteAsync,
} from 'rxdb-premium/plugins/storage-sqlite';

export const fastConfig = {
	storage: getRxStorageSQLite({
		sqliteBasics: getSQLiteBasicsExpoSQLiteAsync(SQLite.openDatabaseAsync),
	}),
};
