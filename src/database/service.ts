import { createRxDatabase, addRxPlugin, checkAdapter, isRxDatabase } from 'rxdb/plugins/core';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import collectionsHelper from 'rxdb-utils/dist/collections';
import { RxDBAdapterCheckPlugin } from 'rxdb/plugins/adapter-check';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
// import { RxDBNoValidatePlugin } from 'rxdb/plugins/no-validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import forEach from 'lodash/forEach';
import isFunction from 'lodash/isFunction';
import camelCase from 'lodash/camelCase';
import set from 'lodash/set';
import get from 'lodash/get';
import unset from 'lodash/unset';
import Platform from '@wcpos/common/src/lib/platform';
import axios from 'axios';
import difference from 'lodash/difference';
import RxDBWooCommerceRestApiSyncPlugin from './plugins/woocommerce-rest-api';
import { userCollections, storeCollections } from './collections';
import logs from './collections/logs';
import users from './collections/users';
import sites from './collections/sites';
import wp_credentials from './collections/wp-credentials';
import stores from './collections/stores';
import products from './collections/products';
import product_variations from './collections/product-variations';
import orders from './collections/orders';
import line_items from './collections/line-items';
import fee_lines from './collections/fee-lines';
import shipping_lines from './collections/shipping-lines';
import customers from './collections/customers';
import { config } from './adapter';
import { ConnectionService } from './collections/sites/service';

if (process.env.NODE_ENV === 'development') {
	// in dev-mode we add the dev-mode plugin
	// which does many checks and adds full error messages
	// also, only add on first render, seems to be conflict with HMR
	if (!module?.hot?.data) {
		addRxPlugin(RxDBDevModePlugin);
	}
}

addRxPlugin(collectionsHelper);
addRxPlugin(RxDBAdapterCheckPlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
// addRxPlugin(RxDBNoValidatePlugin);
addRxPlugin(RxDBValidatePlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBWooCommerceRestApiSyncPlugin);

/**
 * Parse plain data helper
 * @param plainData
 */
const parsePlainData = (
	plainData: Record<string, unknown>,
	collection: import('rxdb').RxCollection
) => {
	const topLevelFields = get(collection, 'schema.topLevelFields');
	/**
	 * convert all plainData properties to camelCase
	 */
	forEach(plainData, (data, key) => {
		const privateProperties = ['_id', '_attachments', '_rev'];
		if (!privateProperties.includes(key) && key.includes('_')) {
			plainData[camelCase(key)] = data;
			unset(plainData, key);
		}
	});

	/**
	 * remove any properties not in the schema
	 */
	const omitProperties = difference(Object.keys(plainData), topLevelFields);
	if (omitProperties.length > 0) {
		console.log('the following properties are being omitted', omitProperties);
		omitProperties.forEach((prop: string) => {
			unset(plainData, prop);
		});
	}
};

/**
 * creates the generic database
 */
export async function _createDB<T>(name: string) {
	const db = await createRxDatabase<T>({
		name,
		...config,
		pouchSettings: { revs_limit: 1, auto_compaction: true },
	});

	// add to window for debugging
	if (Platform.OS === 'web') {
		if (!(window as any).dbs) {
			set(window, 'dbs', {});
		}
		(window as any).dbs[name] = db;
	}

	return db;
}

/**
 * types for the Users database
 */
export type UserDatabaseCollections = {
	logs: import('./collections/logs').LogCollection;
	users: import('./collections/users').UserCollection;
	sites: import('./collections/sites').SiteCollection;
	wp_credentials: import('./collections/wp-credentials').WPCredentialsCollection;
	stores: import('./collections/sites').SiteCollection;
};
export type UserDatabase = import('rxdb').RxDatabase<UserDatabaseCollections>;

/**
 * creates the Users database
 */
export async function _createUsersDB() {
	const db = await _createDB<UserDatabaseCollections>('wcposusers');
	// @ts-ignore
	const collections = await db.addCollections(userCollections);

	// forEach(collections, (collection) => {
	// collection.preInsert((plainData: Record<string, unknown>) => {
	// 	const promises: Promise<any>[] = [];
	// 	parsePlainData(plainData, collection);

	// 	/**
	// 	 * This allows each collection to manage plainData coming from the WC REST API
	// 	 * It loops through each property and calls collection.preInsert{Property}
	// 	 * if it exists
	// 	 */
	// 	forEach(plainData, (data, key) => {
	// 		const preInsertKey = camelCase(`preInsert-${key}`);
	// 		if (isFunction(collection[preInsertKey])) {
	// 			promises.push(collection[preInsertKey](plainData, collection));
	// 		}
	// 	});

	// 	return Promise.all(promises).then(() => plainData);
	// }, false);

	// collection.preSave((plainData: Record<string, unknown>) => {
	// 	parsePlainData(plainData, collection);
	// }, false);
	// });

	// add connection service to site documents
	collections.sites.postCreate((plainData, rxDocument) => {
		const connectionServiceInstance = new ConnectionService(rxDocument);
		Object.defineProperty(rxDocument, 'connection', {
			get: () => connectionServiceInstance,
		});
	});

	return db;
}

/**
 * types for the Store database
 */
export type StoreDatabaseCollections = {
	products: import('./collections/products').ProductCollection;
	orders: import('./collections/orders').OrderCollection;
	line_items: import('./collections/line-items').LineItemCollection;
	fee_lines: import('./collections/fee-lines').FeeLineCollection;
	shipping_lines: import('./collections/shipping-lines').ShippingLineCollection;
	customers: import('./collections/customers').CustomerCollection;
};
export type StoreDatabase = import('rxdb').RxDatabase<StoreDatabaseCollections>;

/**
 * creates the Store database
 */
export async function _createStoresDB(name: string, baseURL: string, jwt: string) {
	const db = await _createDB<StoreDatabaseCollections>(name);
	const httpClient = axios.create({
		baseURL,
		headers: { 'X-WCPOS': '1', Authorization: `Bearer ${jwt}` },
	});
	Object.assign(db, { httpClient });
	console.log('@TODO: the storeDB is initialized multiple times');

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

/**
 * Database Service Interface
 */
export interface IDatabaseService {
	USER_DB_CREATE_PROMISE: Promise<UserDatabase>;
	STORE_DB_CREATE_PROMISE: Promise<StoreDatabase | undefined>;
	getUserDB: () => Promise<UserDatabase>;
	getStoreDB: (name: string, baseURL: string, jwt: string) => Promise<StoreDatabase | undefined>;
}

/**
 * Database Service
 */
const DatabaseService: IDatabaseService = {
	USER_DB_CREATE_PROMISE: _createUsersDB(),
	STORE_DB_CREATE_PROMISE: Promise.resolve(undefined),

	async getUserDB() {
		return this.USER_DB_CREATE_PROMISE;
	},

	async getStoreDB(name, baseURL, jwt) {
		const db = await this.STORE_DB_CREATE_PROMISE;
		if (!db) {
			this.STORE_DB_CREATE_PROMISE = _createStoresDB(name, baseURL, jwt);
		}
		if (db?.name !== name) {
			await db?.destroy();
			this.STORE_DB_CREATE_PROMISE = _createStoresDB(name, baseURL, jwt);
		}
		return this.STORE_DB_CREATE_PROMISE;
	},
};

export { checkAdapter, DatabaseService, isRxDatabase };
