import { createRxDatabase, addRxPlugin, checkAdapter, isRxDatabase } from 'rxdb/plugins/core';
import memoryAdapter from 'pouchdb-adapter-memory';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
// import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import collectionsHelper from 'rxdb-utils/dist/collections';
import { RxDBAdapterCheckPlugin } from 'rxdb/plugins/adapter-check';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBNoValidatePlugin } from 'rxdb/plugins/no-validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { v4 as uuidv4 } from 'uuid';
import forEach from 'lodash/forEach';
import isFunction from 'lodash/isFunction';
import camelCase from 'lodash/camelCase';
import RxDBWooCommerceRestApiSyncPlugin from './plugins/woocommerce-rest-api';
import Platform from '../lib/platform';
import logs from './logs';
import users from './users';
import sites from './sites';
import wp_credentials from './wp-credentials';
import stores from './stores';
import products from './products';
import product_variations from './product-variations';
import orders from './orders';
import line_items from './line-items';
import fee_lines from './fee-lines';
import shipping_lines from './shipping-lines';
import './adapter';

export type UserDatabaseCollections = {
	logs: import('./logs').LogCollection;
	users: import('./users').UserCollection;
	sites: import('./sites').SiteCollection;
	wp_credentials: import('./wp-credentials').WPCredentialsCollection;
	stores: import('./sites').SiteCollection;
};
export type UserDatabase = import('rxdb').RxDatabase<UserDatabaseCollections>;

export type StoreDatabaseCollections = {
	products: import('./products').ProductCollection;
	orders: import('./orders').OrderCollection;
	line_items: import('./line-items').LineItemCollection;
	fee_lines: import('./fee-lines').FeeLineCollection;
	shipping_lines: import('./shipping-lines').ShippingLineCollection;
};
export type StoreDatabase = import('rxdb').RxDatabase<StoreDatabaseCollections>;

if (process.env.NODE_ENV === 'development') {
	// in dev-mode we add the dev-mode plugin
	// which does many checks and adds full error messages
	addRxPlugin(RxDBDevModePlugin);
}

addRxPlugin(memoryAdapter); // in memory db replication for heavy operations
addRxPlugin(collectionsHelper);
addRxPlugin(RxDBAdapterCheckPlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBNoValidatePlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBWooCommerceRestApiSyncPlugin);

/**
 * Default database settings for each platform
 */
let adapter = 'memory';
let multiInstance = true;
if (Platform.OS === 'android' || Platform.OS === 'ios') {
	adapter = 'react-native-sqlite';
	multiInstance = false;
}
if (Platform.OS === 'web') {
	adapter = 'idb';
	if (Platform.isElectron) {
		multiInstance = false;
	}
}

/**
 * creates the generic database
 */
async function createDB(name: string) {
	const db = await createRxDatabase({
		name,
		adapter,
		multiInstance,
	});

	if (Platform.OS === 'web') {
		/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
		(window as any).db = db; // write to window for debugging
	}

	return db;
}

/**
 * creates the Users database
 */
async function createUsersDB() {
	const db = await createDB('wcposusers');

	const collections = await db.addCollections({
		logs,
		users,
		sites,
		wp_credentials,
		stores,
	});

	forEach(collections, (collection, key) => {
		collection.preInsert((plainData: Record<string, unknown>) => {
			if (!plainData.localId) plainData.localId = uuidv4();
			if (!plainData.dateCreatedGmt) plainData.dateCreatedGmt = Date.now();
			/**
			 * This allows each collection to manage plainData coming from the WC REST API
			 * It loops through each property and calls collection.preInsert{Property}
			 * if it exists
			 */
			forEach(plainData, (data, key) => {
				const preInsertKey = camelCase(`preInsert-${key}`);
				if (isFunction(collection[preInsertKey])) {
					collection[preInsertKey](plainData, collection, db);
				}
			});
			return plainData;
		}, false);
	});

	return db;
}

/**
 * creates the Store database
 */
async function createStoresDB(name: string) {
	const db = await createDB(name);

	const collections = await db.addCollections({
		// @ts-ignore
		products,
		product_variations,
		// @ts-ignore
		orders,
		line_items,
		fee_lines,
		shipping_lines,
	});

	return db;
}

const DatabaseService = {
	USER_DB_CREATE_PROMISE: createUsersDB(),
	STORE_DB_CREATE_PROMISE: null,

	getUserDB() {
		return this.USER_DB_CREATE_PROMISE;
	},

	getStoreDB(name: string) {
		// if (this.USER_DB_CREATE_PROMISE) {
		// 	return this.USER_DB_CREATE_PROMISE.then((db) => {
		// 		debugger;
		// 	});
		// }
		this.USER_DB_CREATE_PROMISE = createStoresDB(name);
		return this.USER_DB_CREATE_PROMISE;
	},

	getRandomId() {
		return uuidv4();
	},
};

export { checkAdapter, DatabaseService, isRxDatabase };
