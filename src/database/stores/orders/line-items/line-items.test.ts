import { checkAdapter, isRxDatabase } from 'rxdb';
import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core';
import dbAdapter from 'pouchdb-adapter-memory';
import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import createLineItemsCollection from './line-items';

addRxPlugin(dbAdapter);
addRxPlugin(RxDBValidatePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);

describe('Orders collection', () => {
	let database = null;
	let lineItemsCollection = null;

	beforeAll(async () => {
		database = await createRxDatabase({
			name: 'mydatabase',
			adapter: 'memory', // the name of your adapter
			ignoreDuplicate: true, // this create-call will not throw because you explicitly allow it
		});

		lineItemsCollection = await createLineItemsCollection(database);

		return database;
	});

	afterAll(async () => database.destory());

	it('should be a valid adapter', async () => {
		const ok = await checkAdapter('memory');
		expect(ok).toBe(true);
	});

	it('should be a valid database', async () => {
		expect(isRxDatabase(database)).toBe(true);
	});

	it('should be a valid RxCollection', async () => {
		// create a collection with the schema
		// await createOrdersCollection(database);
		expect(database.line_items.name).toBe('line_items');
	});

	it('should insert a new Line Item document', async () => {
		const order = await lineItemsCollection.insert({
			id: '12345',
		});

		// check defaults
		expect(order).toMatchObject({
			id: '12345',
		});
	});
});
