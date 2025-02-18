import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateZSchemaStorage } from 'rxdb/plugins/validate-z-schema';

import log from '@wcpos/utils/logger';

import { storeCollections } from './collections';

import type { RxDatabase } from 'rxdb';

const collections = { orders: storeCollections.orders };

export type TemporaryDatabase = RxDatabase<typeof collections>;

const storage = getRxStorageMemory();

const devStorage = wrappedValidateZSchemaStorage({
	storage,
});

/**
 *
 */
export async function createTemporaryDB() {
	try {
		const db = await createRxDatabase<TemporaryDatabase>({
			name: 'temporary',
			storage: __DEV__ ? devStorage : storage,
			ignoreDuplicate: true,
		});

		const cols = await db?.addCollections(collections);
		cols.orders.postCreate(function (plainData, rxDocument) {
			Object.defineProperty(rxDocument, 'isNew', {
				get: () => true,
			});
		});

		return db;
	} catch (error) {
		log.error(error);
	}
}
