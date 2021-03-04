// import { TestScheduler } from 'rxjs/testing';
import { skip } from 'rxjs/operators';
import createLineItemsCollection from './line-items';
import createTestDatabase from '../../../jest/create-test-database';

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
		database = await createTestDatabase();
		lineItemsCollection = await createLineItemsCollection(database);
	});

	afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => database.destory());

	it('should be a valid RxCollection', async () => {
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
