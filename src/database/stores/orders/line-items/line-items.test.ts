// import { TestScheduler } from 'rxjs/testing';
import { skip } from 'rxjs/operators';
import { createRxDatabase, addRxPlugin, checkAdapter, isRxDatabase } from 'rxdb/plugins/core';
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
	let subscription = null;
	let database = null;
	let lineItemsCollection = null;

	// beforeEach(() => {
	// 	testScheduler = new TestScheduler((actual, expected) => {
	// 		expect(actual).toEqual(expected);
	// 	});
	// });

	beforeAll(async () => {
		database = await createRxDatabase({
			name: 'mydatabase',
			adapter: 'memory', // the name of your adapter
			ignoreDuplicate: true, // this create-call will not throw because you explicitly allow it
		});

		lineItemsCollection = await createLineItemsCollection(database);

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
		expect(database.line_items.name).toBe('line_items');
	});

	it('should insert a new Line Item document', async () => {
		const lineItem = await lineItemsCollection.insert({
			id: 12345,
		});

		expect(lineItem).toMatchObject({
			id: '12345',
		});
	});

	it('should calculate the quantity * price', async (done) => {
		const lineItem = await lineItemsCollection.findOne('12345').exec();

		subscription = lineItem.$.pipe(skip(2)).subscribe((result) => {
			expect(result).toMatchObject({
				id: '12345',
				quantity: 1,
				price: 1.23,
				total: '1.23',
			});

			done();
		});

		await lineItem.update({
			$set: {
				quantity: 1,
				price: 1.23,
			},
		});
	});

	it('should update on quantity change', async (done) => {
		const lineItem = await lineItemsCollection.findOne('12345').exec();

		subscription = lineItem.$.pipe(skip(2)).subscribe((result) => {
			expect(result).toMatchObject({
				id: '12345',
				quantity: 2,
				price: 1.23,
				total: '2.46',
			});

			done();
		});

		await lineItem.update({
			$inc: {
				quantity: 1, // increase quantity by 1
			},
		});
	});
});
