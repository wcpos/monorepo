import { addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBJsonDumpPlugin } from 'rxdb/plugins/json-dump';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';

import { findOneFixPlugin } from './find-one-fix';
import { RxDBGenerateIdPlugin } from './generate-id';
import middlewaresPlugin from './middlewares';
import parseRestResponsePlugin from './parse-rest-response';
import populatePlugin from './populate';

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
addRxPlugin(RxDBMigrationPlugin);
addRxPlugin(RxDBJsonDumpPlugin);

// custom plugins
addRxPlugin(middlewaresPlugin);
addRxPlugin(RxDBGenerateIdPlugin); // should be before populate
addRxPlugin(populatePlugin);
addRxPlugin(findOneFixPlugin);
addRxPlugin(parseRestResponsePlugin);
