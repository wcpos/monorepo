import * as SQLite from 'expo-sqlite';
import {
	getRxStorageSQLite,
	getSQLiteBasicsExpoSQLiteAsync,
} from 'rxdb-premium/plugins/storage-sqlite';

const config = {
	storage: getRxStorageSQLite({
		sqliteBasics: getSQLiteBasicsExpoSQLiteAsync(SQLite.openDatabaseAsync),
	}),
};

export default config;
