import { addRxPlugin } from 'rxdb';
import { RxDBAttachmentsPlugin } from 'rxdb/plugins/attachments';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBJsonDumpPlugin } from 'rxdb/plugins/json-dump';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBStatePlugin } from 'rxdb/plugins/state';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBFlexSearchPlugin } from 'rxdb-premium/plugins/flexsearch';
import { setPremiumFlag, disableVersionCheck } from 'rxdb-premium/plugins/shared';

import { findOneFixPlugin } from './find-one-fix';
import { RxDBGenerateIdPlugin } from './generate-id';
import middlewaresPlugin from './middlewares';
import parseRestResponsePlugin from './parse-rest-response';
import populatePlugin from './populate';
import { resetCollectionPlugin } from './reset-collection';
import { searchPlugin } from './search';

/**
 * Important: setPremiumFlag must be before addRxPlugin is called
 */
disableVersionCheck();
setPremiumFlag();

if (__DEV__) {
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
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBMigrationPlugin);
addRxPlugin(RxDBJsonDumpPlugin);
addRxPlugin(RxDBAttachmentsPlugin);
addRxPlugin(RxDBStatePlugin);
addRxPlugin(RxDBCleanupPlugin);
addRxPlugin(RxDBFlexSearchPlugin);
// addRxPlugin(RxDBPipelinePlugin);

// custom plugins
addRxPlugin(RxDBGenerateIdPlugin); // should run before populate and parseRestResponse
addRxPlugin(populatePlugin);
addRxPlugin(findOneFixPlugin);
addRxPlugin(parseRestResponsePlugin);
addRxPlugin(resetCollectionPlugin);
addRxPlugin(searchPlugin);
addRxPlugin(middlewaresPlugin);
