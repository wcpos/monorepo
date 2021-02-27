import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import idbAdapter from 'pouchdb-adapter-idb';
// import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import { RxDBNoValidatePlugin } from 'rxdb/plugins/no-validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import collections from 'rxdb-utils/dist/collections';
import RxDBWooCommerceRestApiReplicationPlugin from '../plugins/woocommerce-rest-api';

// type Collections = import('../database').Collections;
// type Database = import('../database').Database;

if (process.env.NODE_ENV !== 'production') {
	addRxPlugin(RxDBDevModePlugin);
}

addRxPlugin(idbAdapter);
addRxPlugin(RxDBNoValidatePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(collections);
addRxPlugin(RxDBWooCommerceRestApiReplicationPlugin);

const getDatabase = async (name: string) => {
	const db = createRxDatabase({
		name,
		adapter: 'idb', // the name of your adapter
		ignoreDuplicate: true, // for development?
	});
	return db;
};

export default getDatabase;
