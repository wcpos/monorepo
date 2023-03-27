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
	return `store-${id}`;
}

/**
 *
 */
const registry = new Map<string, Promise<StoreDatabase | undefined>>();

/**
 * Create a subject which emits one of the storeCollections
 */
const addCollectionsSubject = new Subject();

/**
 * creates the Store database
 */
export async function createStoreDB(id: string) {
	if (!registry.has(id)) {
		const name = sanitizeStoreName(id);
		try {
			const db = await createDB<StoreDatabaseCollections>(name);
			if (db) {
				const collections = await db?.addCollections(storeCollections);
				Object.assign(db, { addCollections$: addCollectionsSubject.asObservable() });
				registry.set(id, Promise.resolve(db));
			}
		} catch (error) {
			log.error(error);
			removeDB(name);
		}
	}

	return registry.get(id);
}

/**
 * Helper function to add the collectioms individually, ie: after collection.remove()
 */
export async function addStoreDBCollection(id: string, key: keyof StoreDatabaseCollections) {
	try {
		const db = await createStoreDB(id);
		if (db) {
			const result = await db.addCollections({
				[key]: storeCollections[key],
			});
			addCollectionsSubject.next(result);
			return result;
		}
	} catch (error) {
		log.error(error);
	}
}

/**
 * removes the Store database by name
 */
export async function removeStoreDB(id: string) {
	const name = sanitizeStoreName(id);
	return removeDB(name);
}
