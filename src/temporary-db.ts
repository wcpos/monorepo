import {
	createRxDatabase,
	toTypedRxJsonSchema,
	ExtractDocumentTypeFromTypedRxJsonSchema,
	RxJsonSchema,
} from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import log from '@wcpos/utils/src/logger';

import { ordersLiteral } from './collections/schemas/orders';

import type { RxCollectionCreator, RxCollection, RxDatabase } from 'rxdb';

const ordersTyped = toTypedRxJsonSchema(ordersLiteral);
export const OrderSchema: RxJsonSchema<OrderDocument> = ordersLiteral;
export type OrderDocument = ExtractDocumentTypeFromTypedRxJsonSchema<typeof ordersTyped>;
export type OrderCollection = RxCollection<OrderDocument>;
const orders: RxCollectionCreator<OrderDocument> = { schema: ordersLiteral };
const collections = { orders };

export type TemporaryDatabase = RxDatabase<typeof collections>;

/**
 *
 */
let temporaryDB: Promise<TemporaryDatabase>;

/**
 * This could be called more than once, so we need to make sure we only create the DB once.
 */
export async function createTemporaryDB() {
	if (!temporaryDB) {
		try {
			const db = (await createRxDatabase({
				name: 'temporary',
				storage: getRxStorageMemory(),
			})) as unknown as TemporaryDatabase;
			const c = await db?.addCollections(collections);
			c.orders.postCreate(function (plainData, rxDocument) {
				Object.defineProperty(rxDocument, 'isNew', {
					get: () => true,
				});
			});
			temporaryDB = Promise.resolve(db);
		} catch (error) {
			log.error(error);
		}
	}

	return temporaryDB;
}
