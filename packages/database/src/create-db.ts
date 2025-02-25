import { createRxDatabase, removeRxDatabase } from 'rxdb';

import log from '@wcpos/utils/logger';

import { defaultConfig } from './adapters/default';
import { ephemeralStorageConfig } from './adapters/ephemeral';
import { fastStorageConfig } from './adapters/fast';
import {
	storeCollections,
	StoreCollections,
	userCollections,
	UserCollections,
	syncCollections,
	SyncCollections,
	temporaryCollections,
	TemporaryCollections,
} from './collections';

/**
 * Creates the User database
 */
export const createUserDB = async () => {
	const name = 'wcposusers_v2';
	try {
		const db = await createRxDatabase<UserCollections>({
			name,
			ignoreDuplicate: !!__DEV__,
			...defaultConfig,
		});
		const collections = await db?.addCollections(userCollections);
		return db;
	} catch (error) {
		log.error(error);
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
			ignoreDuplicate: !!__DEV__,
			...defaultConfig,
		});
		const collections = await db?.addCollections(storeCollections);
		return db;
	} catch (error) {
		log.error(error);
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
			ignoreDuplicate: !!__DEV__,
			...fastStorageConfig,
		});
		const collections = await db?.addCollections(syncCollections);
		return db;
	} catch (error) {
		log.error(error);
	}
};

/**
 * creates the Emphemeral database
 */
export const createTemporaryDB = async () => {
	try {
		const db = await createRxDatabase<TemporaryCollections>({
			name: 'temporary',
			ignoreDuplicate: !!__DEV__,
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
		log.error(error);
	}
};
