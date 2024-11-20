import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import log from '@wcpos/utils/src/logger';

import { storeCollections } from './collections';

import type { RxDatabase } from 'rxdb';

const collections = { orders: storeCollections.orders };

export type TemporaryDatabase = RxDatabase<typeof collections>;

/**
 *
 */
export async function createTemporaryDB() {
	try {
		const db = await createRxDatabase<TemporaryDatabase>({
			name: 'temporary',
			storage: getRxStorageMemory(),
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
