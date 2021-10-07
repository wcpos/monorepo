import { from } from 'rxjs';
import { storeCollections } from './collections';
import { createDB } from './create-db';

export type StoreDatabaseCollections = {
	products: import('./collections/products').ProductCollection;
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
	const db = await createDB<StoreDatabaseCollections>(sanitizeStoreName(id));
	// const httpClient = axios.create({
	// 	baseURL,
	// 	headers: { 'X-WCPOS': '1', Authorization: `Bearer ${jwt}` },
	// });
	// Object.assign(db, { httpClient });

	// @ts-ignore
	const collections = await db.addCollections(storeCollections);

	/**
	 * Attach hooks for each collection
	 */
	// forEach(collections, (collection) => {
	// 	forEach(collection.options.hooks, (hook, key) => {
	// 		const { handle, parallel } = hook;
	// 		collection[key](handle, parallel);
	// 	});

	// 	collection.preInsert((plainData: Record<string, unknown>) => {
	// 		const promises: Promise<any>[] = [];
	// 		parsePlainData(plainData, collection);

	// 		/**
	// 		 * This allows each collection to manage plainData coming from the WC REST API
	// 		 * It loops through each property and calls collection.preInsert{Property}
	// 		 * if it exists
	// 		 */
	// 		forEach(plainData, (data, key) => {
	// 			const preInsertKey = camelCase(`preInsert-${key}`);
	// 			if (isFunction(collection[preInsertKey])) {
	// 				promises.push(collection[preInsertKey](plainData, collection, db));
	// 			}
	// 		});

	// 		return Promise.all(promises).then(() => plainData);
	// 	}, false);

	// 	collection.preSave((plainData: Record<string, unknown>, rxDocument) => {
	// 		parsePlainData(plainData, collection);
	// 	}, false);
	// });

	return db;
}

export const getStoreDB$ = (id: string) => from(storeDBPromise(id));
