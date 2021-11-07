import { addRxPlugin } from 'rxdb/plugins/core';
import { addPouchPlugin } from 'rxdb/plugins/pouchdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
// import { RxDBNoValidatePlugin } from 'rxdb/plugins/no-validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import collectionsHelper from './utils/collections';
import removeChildren from './remove-children';
import collectionCounts from './collection-counts';
import { RxDBGenerateIdPlugin } from './utils/generate-id';
import RxDBWooCommerceRestApiSyncPlugin from './woocommerce-rest-api';

addPouchPlugin(require('pouchdb-adapter-idb'));

if (process.env.NODE_ENV === 'development') {
	// in dev-mode we add the dev-mode plugin
	// which does many checks and adds full error messages
	// also, only add on first render, seems to be conflict with HMR
	if (!module?.hot?.data) {
		// addRxPlugin(RxDBDevModePlugin);
	}

	// add debugging
	// @ts-ignore
	// import('pouchdb-debug').then((pouchdbDebug) => {
	// 	PouchDB.plugin(pouchdbDebug.default);
	// 	PouchDB.debug.enable('*');
	// });
}

addRxPlugin(collectionsHelper);
addRxPlugin(removeChildren);
addRxPlugin(collectionCounts);

addRxPlugin(RxDBGenerateIdPlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
// addRxPlugin(RxDBNoValidatePlugin);
addRxPlugin(RxDBValidatePlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBWooCommerceRestApiSyncPlugin);
