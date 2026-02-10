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

const dbLogger = getLogger(['wcpos', 'db', 'create']);

/**
 * Creates the User database
 */
export const createUserDB = async () => {
	const name = 'wcposusers_v2';
	try {
		const db = await createRxDatabase<UserCollections>({
			name,
			...defaultConfig,
		});
		await db?.addCollections(userCollections);
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
	const name = `store_v2_${id}`; // Database name needs to start with a letter, id is a short uuid
	try {
		const db = await createRxDatabase<StoreCollections>({
			name,
			allowSlowCount: true,
			...defaultConfig,
			closeDuplicates: true, // Allow returning existing DB when switching back to a store
		});
		await db?.addCollections(storeCollections);
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
	const name = `fast_store_v3_${id}`;
	try {
		const db = await createRxDatabase<SyncCollections>({
			name,
			allowSlowCount: true,
			...fastStorageConfig,
			closeDuplicates: true, // Allow returning existing DB when switching back to a store
		});
		await db?.addCollections(syncCollections);
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
