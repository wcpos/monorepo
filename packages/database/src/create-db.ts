import { createRxDatabase } from 'rxdb';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { defaultConfig } from './adapters/default';
import { ephemeralStorageConfig } from './adapters/ephemeral';
import { fastStorageConfig } from './adapters/fast';
import {
	StoreCollections,
	storeCollections,
	SyncCollections,
	syncCollections,
	TemporaryCollections,
	temporaryCollections,
	UserCollections,
	userCollections,
} from './collections';
import { getStorageMigrationConfig } from './migration/storage';
import {
	getFastStoreDatabaseNames,
	getStoreDatabaseNames,
	getUserDatabaseNames,
} from './migration/storage/database-names';
import { runStorageMigration } from './migration/storage/run-storage-migration';
import { verifyStorageMigration } from './migration/storage/verify-migration';

import type { StorageMigrationDatabase } from './migration/storage/types';

const dbLogger = getLogger(['wcpos', 'db', 'create']);

const runPersistentStorageMigration = async (
	database: StorageMigrationDatabase,
	oldDatabaseName: string
) => {
	const { oldStorage, sourceStorage, targetStorage } = getStorageMigrationConfig();

	await verifyStorageMigration({
		database,
		oldDatabaseName,
		sourceStorage,
		targetStorage,
	});

	await runStorageMigration({
		database,
		oldDatabaseName,
		oldStorage: oldStorage as any,
		sourceStorage,
		targetStorage,
	});
};

/**
 * Creates the User database
 */
export const createUserDB = async () => {
	const { oldName: oldDatabaseName, newName: name } = getUserDatabaseNames();
	try {
		const db = await createRxDatabase<UserCollections>({
			name,
			...defaultConfig,
		});
		await db?.addCollections(userCollections);
		await runPersistentStorageMigration(db, oldDatabaseName);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create user database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: name,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		// removeDB('wcposusers_v150');
	}
};

/**
 * creates the Store database
 */
export const createStoreDB = async (id: string) => {
	const { oldName: oldDatabaseName, newName: name } = getStoreDatabaseNames(id); // Database name needs to start with a letter, id is a short uuid
	try {
		const db = await createRxDatabase<StoreCollections>({
			name,
			allowSlowCount: true,
			...defaultConfig,
			closeDuplicates: true, // Allow returning existing DB when switching back to a store
		});
		await db?.addCollections(storeCollections);
		await runPersistentStorageMigration(db, oldDatabaseName);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create store database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: name,
				storeId: id,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};

/**
 * creates the Sync State database
 */
export const createFastStoreDB = async (id: string) => {
	const { oldName: oldDatabaseName, newName: name } = getFastStoreDatabaseNames(id);
	try {
		const db = await createRxDatabase<SyncCollections>({
			name,
			allowSlowCount: true,
			...fastStorageConfig,
			closeDuplicates: true, // Allow returning existing DB when switching back to a store
		});
		await db?.addCollections(syncCollections);
		await runPersistentStorageMigration(db, oldDatabaseName);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create fast store database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: name,
				storeId: id,
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};

/**
 * creates the Emphemeral database
 */
export const createTemporaryDB = async () => {
	try {
		const db = await createRxDatabase<TemporaryCollections>({
			name: 'temporary',
			...ephemeralStorageConfig,
		});

		const cols = await db?.addCollections(temporaryCollections);
		cols.orders.postCreate(function (plainData, rxDocument) {
			Object.defineProperty(rxDocument, 'isNew', {
				get: () => true,
			});
		});

		return db;
	} catch (error) {
		dbLogger.error('Failed to create temporary database', {
			showToast: true,
			saveToDb: true,
			context: {
				errorCode: ERROR_CODES.CONNECTION_FAILED,
				databaseName: 'temporary',
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
