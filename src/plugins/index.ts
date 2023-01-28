import { addRxPlugin } from 'rxdb';
// default plugins
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
// import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
// import { RxDBKeyCompressionPlugin } from 'rxdb/plugins/key-compression';
// import { RxDBEncryptionPlugin } from 'rxdb/plugins/encryption';
// import { RxDBReplicationCouchDBPlugin } from 'rxdb/plugins/replication-couchdb';
import { RxDBJsonDumpPlugin } from 'rxdb/plugins/json-dump';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
// import { RxDBInMemoryPlugin } from 'rxdb/plugins/in-memory';
// import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';

// custom plugins
import childrenPlugin from './children';
import collectionCounts from './collection-counts';
import { RxDBGenerateIdPlugin } from './generate-id';
import middlewaresPlugin from './middlewares';
import populatePlugin from './populate';
import toJSONPlugin from './to-json';
// import { RxDBAjvValidatePlugin } from './validate';
import RxDBWooCommercePlugin from './woocommerce';
// import deleteDBPlugin from './delete-db';

if (process.env.NODE_ENV === 'development') {
	// in dev-mode we add the dev-mode plugin
	// which does many checks and adds full error messages
	// also, only add on first render, seems to be conflict with HMR
	// if (!module?.hot?.data) {
	// 	addRxPlugin(RxDBDevModePlugin);
	// }
	addRxPlugin(RxDBDevModePlugin);

	// add debugging
	// @ts-ignore
	// import('pouchdb-debug').then((pouchdbDebug) => {
	// 	PouchDB.plugin(pouchdbDebug.default);
	// 	PouchDB.debug.enable('*');
	// });
}

// default plugins
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBLeaderElectionPlugin);
// addRxPlugin(RxDBEncryptionPlugin);
addRxPlugin(RxDBMigrationPlugin);
// addRxPlugin(RxDBKeyCompressionPlugin);
addRxPlugin(RxDBJsonDumpPlugin);
// addRxPlugin(RxDBKeyCompressionPlugin);

// custom plugins
// addRxPlugin(collectionCounts);
// addRxPlugin(RxDBWooCommercePlugin);
// addRxPlugin(RxDBAjvValidatePlugin);
// addRxPlugin(childrenPlugin);
addRxPlugin(middlewaresPlugin);
// addRxPlugin(toJSONPlugin);
addRxPlugin(RxDBGenerateIdPlugin); // should be before populate?
addRxPlugin(populatePlugin);
// addRxPlugin(deleteDBPlugin);
