import { skip } from 'rxjs/operators';
import { checkAdapter, isRxDatabase } from 'rxdb';
import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core';
import dbAdapter from 'pouchdb-adapter-memory';
import { RxDBValidatePlugin } from 'rxdb/plugins/validate';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import collections from 'rxdb-utils/dist/collections';
import createOrdersCollection from './orders';

addRxPlugin(dbAdapter);
addRxPlugin(RxDBValidatePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(collections);

describe('Orders collection', () => {
	let subscription = null;
	let database = null;
	let ordersCollection = null;

	beforeAll(async () => {
		database = await createRxDatabase({
			name: 'mydatabase',
			adapter: 'memory', // the name of your adapter
			ignoreDuplicate: true, // this create-call will not throw because you explicitly allow it
		});

		ordersCollection = await createOrdersCollection(database);

		return database;
	});

	afterEach(async () => subscription && subscription.unsubscribe());
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
		expect(database.orders.name).toBe('orders');
	});

	it('should insert a new Order document', async () => {
		const order = await ordersCollection.insert({
			id: '12345',
		});

		subscription = order.$.pipe(skip(1)).subscribe((result) => {
			expect(order).toMatchObject({
				currency: 'AUD',
				customer_id: 0,
				id: '12345',
				status: 'pending',
			});

			done();
		});
	});
});
