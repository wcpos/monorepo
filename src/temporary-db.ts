import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import log from '@wcpos/utils/src/logger';

import orderSchema from './collections/orders/schema.json';

export type TemporaryDatabaseCollections = {
	orders: import('./collections/orders').OrderCollection;
};
export type TemporaryDatabase = import('rxdb').RxDatabase<TemporaryDatabaseCollections>;

/**
 * Remove children references from schema
 */
const newOrderSchema = {
	...orderSchema,
	properties: {
		...orderSchema.properties,
		isNew: {
			type: 'boolean',
			default: true,
		},
		line_items: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		fee_lines: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
		shipping_lines: {
			type: 'array',
			items: {
				type: 'string',
			},
		},
	},
};

/**
 *
 */
let temporaryDB: Promise<TemporaryDatabase | undefined>;

/**
 * This could be called more than once, so we need to make sure we only create the DB once.
 */
export async function createTemporaryDB() {
	if (!temporaryDB) {
		try {
			const db = await createRxDatabase<TemporaryDatabase>({
				name: 'temporary',
				storage: getRxStorageMemory(),
			});
			const collections = await db?.addCollections({
				orders: {
					schema: newOrderSchema,
				},
			});
			temporaryDB = Promise.resolve(db);
		} catch (error) {
			log.error(error);
		}
	}

	return temporaryDB;
}
