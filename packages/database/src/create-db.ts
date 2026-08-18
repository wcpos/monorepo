import { createRxDatabase } from 'rxdb';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { defaultConfig } from './adapters/default';
import { ephemeralStorageConfig } from './adapters/ephemeral';
import {
	StoreCollections,
	storeCollections,
	TemporaryCollections,
	temporaryCollections,
	UserCollections,
	userCollections,
} from './collections';
import { getStoreDatabaseName, getUserDatabaseName } from './database-names';

const dbLogger = getLogger(['wcpos', 'db', 'create']);

/**
 * Creates the User database
 */
export const createUserDB = async () => {
	const name = getUserDatabaseName();
	try {
		const db = await createRxDatabase<UserCollections>({
			name,
			...defaultConfig,
			localDocuments: true,
		});
		await db?.addCollections(userCollections);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create user database', {
			showToast: true,
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: {
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
	const name = getStoreDatabaseName(id); // Database name needs to start with a letter, id is a short uuid
	try {
		const db = await createRxDatabase<StoreCollections>({
			name,
			allowSlowCount: true,
			...defaultConfig,
			localDocuments: true,
			closeDuplicates: true, // Allow returning existing DB when switching back to a store
		});
		await db?.addCollections(storeCollections);
		return db;
	} catch (error) {
		dbLogger.error('Failed to create store database', {
			showToast: true,
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: {
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
			code: ERROR_CODES.LOCAL_DB_SETUP_FAILED,
			context: {
				databaseName: 'temporary',
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
};
