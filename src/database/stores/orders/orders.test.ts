import { checkAdapter, isRxDatabase } from 'rxdb';
import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core';
import dbAdapter from 'pouchdb-adapter-memory';
import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import createOrdersCollection from './orders';

addRxPlugin(dbAdapter);
addRxPlugin(RxDBValidatePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);

describe('Orders model', () => {
	it('should be a valid adapter', async () => {
		const ok = await checkAdapter('memory');
		expect(ok).toBe(true);
	});

	it('should be a valid database', async () => {
		const database = await createRxDatabase({
			name: 'mydatabase',
			adapter: 'memory', // the name of your adapter
			ignoreDuplicate: true, // this create-call will not throw because you explicitly allow it
		});

		expect(isRxDatabase(database)).toBe(true);
	});

	it('should be a valid RxCollection', async () => {
		const database = await createRxDatabase({
			name: 'mydatabase',
			adapter: 'memory', // the name of your adapter
			ignoreDuplicate: true, // this create-call will not throw because you explicitly allow it
		});

		// create a collection with the schema
		await createOrdersCollection(database);

		expect(database.orders.name).toBe('orders');
	});
});
