import { isRxDocument, isRxCollection } from 'rxdb/plugins/core';
import { DatabaseService } from '../service';

describe('Fee Lines Collection', () => {
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getStoreDB('test');
	});

	// afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should be a valid RxCollection', async () => {
		// create a collection with the schema
		// await createOrdersCollection(database);
		expect(isRxCollection(db.feeLines)).toBe(true);
		expect(db.feeLines.name).toBe('feeLines');
	});

	it('should insert a new Line Item document', async () => {
		const order = await db.feeLines.insert({
			number: '12345',
		});

		// check defaults
		expect(order).toMatchObject({
			currency: 'AUD',
			customer_id: 0,
			id: 'undefined',
			number: '12345',
			status: 'pending',
		});
	});
});
