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
