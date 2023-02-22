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
const storeDBMap = new Map<string, Promise<StoreDatabase>>();

/**
 * creates the Store database
 */
export function storeDBPromise(id: string) {
	if (storeDBMap.has(id)) {
		return storeDBMap.get(id);
	}

	const name = sanitizeStoreName(id);

	const db = createDB<StoreDatabaseCollections>(name)
		.then(async (db) => {
			await db.addCollections(storeCollections);
			return db;
		})
		.catch((error) => {
			console.error(error);
			if (process.env.NODE_ENV === 'development') {
				return removeDB(name);
			}
		});

	storeDBMap.set(id, db);

	return db;
}

/**
 * creates the Store database
 */
export function removeStoreDB(id: string) {
	const name = sanitizeStoreName(id);
	return removeDB(name);
}
