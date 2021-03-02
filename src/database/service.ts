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
import wpcredentials from './wp-credentials';
import stores from './stores';
import './adapter';

type RxCollection = import('rxdb').RxCollection;

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
async function createDB(name: string): Promise<any> {
	const db = await createRxDatabase<any>({
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
 * creates the generic database
 */
async function createUsersDB(): Promise<any> {
	const db = await createDB('wcposusers');

	const collections: RxCollection[] = await db.addCollections({
		logs,
		users,
		sites,
		wpcredentials,
		stores,
	});

	forEach(collections, (collection, key) => {
		collection.preInsert((plainData: Record<string, unknown>) => {
			if (!plainData.localId) plainData.localId = uuidv4();
			if (!plainData.dateCreatedGmt) plainData.dateCreatedGmt = Date.now();
			forEach(plainData, (data, key) => {
				const preInsertKey = camelCase(`preInsert-${key}`);
				if (isFunction(collection[preInsertKey])) {
					collection[preInsertKey](plainData, collection, db);
				}
			});
			debugger;
			return plainData;
		}, false);
	});

	return db;
}

const DatabaseService = {
	USER_DB_CREATE_PROMISE: createUsersDB(),
	STORE_DB_CREATE_PROMISE: null,

	getUserDB() {
		return this.USER_DB_CREATE_PROMISE;
	},

	getStoreDB() {
		return this.USER_DB_CREATE_PROMISE;
	},

	getRandomId() {
		return uuidv4();
	},
};

export { checkAdapter, DatabaseService, isRxDatabase };
