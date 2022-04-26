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
	taxes: import('./collections/taxes').TaxRateCollection;
};
export type StoreDatabase = import('rxdb').RxDatabase<StoreDatabaseCollections>;

function sanitizeStoreName(id: string) {
	return `store_${id.replace(':', '_')}`;
}

/**
 * creates the Store database
 */
export async function storeDBPromise(id: string) {
	const name = sanitizeStoreName(id);
	const db = await createDB<StoreDatabaseCollections>(name);

	// @ts-ignore
	const collections = await db.addCollections(storeCollections).catch((error) => {
		debugger;
		if (process.env.NODE_ENV === 'development') {
			return removeDB(name);
		}
	});

	return db;
}
