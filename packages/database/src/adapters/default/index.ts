import * as SQLite from 'expo-sqlite';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';
import {
	getRxStorageSQLite,
	getSQLiteBasicsExpoSQLiteAsync,
} from 'rxdb-premium/plugins/storage-sqlite';

export const storage = getRxStorageSQLite({
	sqliteBasics: getSQLiteBasicsExpoSQLiteAsync(SQLite.openDatabaseAsync),
});

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

export const defaultConfig = {
	storage: __DEV__ ? devStorage : storage,
	multiInstance: false, // must be false for react native
};
