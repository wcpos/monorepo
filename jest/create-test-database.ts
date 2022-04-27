import { createRxDatabase, addRxPlugin } from 'rxdb';
import dbAdapter from 'pouchdb-adapter-memory';
import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBAdapterCheckPlugin } from 'rxdb/plugins/adapter-check';
import collections from 'rxdb-utils/dist/collections';

addRxPlugin(dbAdapter);
addRxPlugin(RxDBValidatePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBAdapterCheckPlugin);
addRxPlugin(collections);

export default async () =>
	createRxDatabase({
		name: 'mydatabase',
		adapter: 'memory', // the name of your adapter
		ignoreDuplicate: true, // this create-call will not throw because you explicitly allow it
	});
