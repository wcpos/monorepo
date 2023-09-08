import { Subject } from 'rxjs';

import log from '@wcpos/utils/src/logger';

import { storeCollections } from './collections';
import { createDB, removeDB } from './create-db';

export type StoreDatabaseCollections = {
	products: import('./collections/products').ProductCollection;
	variations: import('./collections/variations').ProductVariationCollection;
	orders: import('./collections/orders').OrderCollection;
	line_items: import('./collections/line-items').LineItemCollection;
	fee_lines: import('./collections/fee-lines').FeeLineCollection;
	shipping_lines: import('./collections/shipping-lines').ShippingLineCollection;
	customers: import('./collections/customers').CustomerCollection;
	taxes: import('./collections/tax-rates').TaxRateCollection;
	payment_gateways: import('./collections/payment-gateways').PaymentGatewayCollection;
	'products/categories': import('./collections/categories').ProductCategoryCollection;
	'products/tags': import('./collections/tags').ProductTagCollection;
};
export type StoreDatabase = import('rxdb').RxDatabase<StoreDatabaseCollections>;

/**
 * Database name needs to start with a letter, id is a short uuid
 */
function sanitizeStoreName(id: string) {
	return `store_${id}`;
}

/**
 *
 */
// const registry = new Map<string, Promise<StoreDatabase | undefined>>();

/**
 * creates the Store database
 */
export async function createStoreDB(id: string) {
	const name = sanitizeStoreName(id);
	try {
		const db = await createDB<StoreDatabaseCollections>(name);
		const collections = await db?.addCollections(storeCollections);
		return db;
	} catch (error) {
		log.error(error);
		removeDB(name);
	}
	// if (!registry.has(id)) {
	// 	const name = sanitizeStoreName(id);
	// 	try {
	// 		const db = await createDB<StoreDatabaseCollections>(name);
	// 		if (db) {
	// 			const collections = await db?.addCollections(storeCollections);
	// 			registry.set(id, Promise.resolve(db));
	// 		}
	// 	} catch (error) {
	// 		log.error(error);
	// 		removeDB(name);
	// 	}
	// }

	// return registry.get(id);
}

/**
 * removes the Store database by name
 */
export async function removeStoreDB(id: string) {
	const name = sanitizeStoreName(id);
	return removeDB(name);
}
