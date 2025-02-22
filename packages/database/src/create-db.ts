import { createRxDatabase, removeRxDatabase } from 'rxdb';

import log from '@wcpos/utils/logger';

import { defaultStorage } from './adapters/default';
import { ephemeralStorageAdapter } from './adapters/ephemeral';
import { fastStorageAdapter } from './adapters/fast';
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
			storage: defaultStorage,
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
			storage: defaultStorage,
			allowSlowCount: true,
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
			storage: fastStorageAdapter,
			allowSlowCount: true,
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
			storage: ephemeralStorageAdapter,
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
