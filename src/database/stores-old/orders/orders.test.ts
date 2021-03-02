import { skip } from 'rxjs/operators';
import { isRxCollection } from 'rxdb/plugins/core';
import createOrdersCollection from './orders';
import createTestDatabase from '../../../../jest/create-test-database';

describe('Orders collection', () => {
	const subscription = null;
	let database = null;
	let ordersCollection = null;

	beforeAll(async () => {
		database = await createTestDatabase();
		ordersCollection = await createOrdersCollection(database);
	});

	afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => database.destory());

	it('should be a valid RxCollection', async () => {
		expect(isRxCollection(database?.orders)).toBe(true);
	});

	it('should also create required children, eg: line items', async () => {
		expect(isRxCollection(database?.line_items)).toBe(true);
		expect(isRxCollection(database?.fee_lines)).toBe(true);
		expect(isRxCollection(database?.shipping_lines)).toBe(true);
	});

	it('should insert a new Order document', async () => {
		const order = await ordersCollection.insert({
			id: 12345,
		});

		expect(order).toMatchObject({
			id: '12345',
			currency: 'AUD', // default
			customer_id: 0, // default
			status: 'pending', // default
		});
	});

	it('the new order should be open', async () => {
		const order = await ordersCollection.findOne('12345').exec();
		expect(order.isOpen()).toBe(true);
	});

	// it('should insert line_items', async (done) => {
	// 	const order = await ordersCollection.insert({
	// 		id: 1234567890,
	// 		line_items: [{ id: 123 }, { id: 1234 }],
	// 	});

	// 	subscription = order.$.pipe(skip(1)).subscribe((result) => {
	// 		expect(order).toMatchObject({
	// 			currency: 'AUD',
	// 			customer_id: 0,
	// 			id: '1234567890',
	// 			status: 'pending',
	// 		});

	// 		done();
	// 	});
	// });
});
