import { skip } from 'rxjs/operators';
import { isRxCollection } from 'rxdb';
import { DatabaseService } from '../../service';

describe('Orders collection', () => {
	const subscription: any = null;
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getStoreDB('test', '', '');
	});

	afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db.destory());

	it('should be a valid RxCollection', async () => {
		expect(isRxCollection(db?.orders)).toBe(true);
	});

	it('should also create required children, eg: line items', async () => {
		expect(isRxCollection(db?.line_items)).toBe(true);
		expect(isRxCollection(db?.fee_lines)).toBe(true);
		expect(isRxCollection(db?.shipping_lines)).toBe(true);
	});

	it('should insert a new Order document', async () => {
		const order = await db.orders.insert({
			id: 12345,
		});

		expect(order).toMatchObject({
			localID: expect.any(String),
			id: 12345,
			currency: 'AUD', // default
			customerId: 0, // default
			status: 'pending', // default
		});
	});

	it('the new order should be open', async () => {
		const order = await db.orders.findOne({ selector: { id: 12345 } }).exec();
		expect(order.isOpen()).toBe(true);
	});

	it('should insert line_items', async () => {
		const order = await db.orders.insert({
			id: 1234567890,
			line_items: [{ id: 123 }, { id: 1234 }],
		});

		expect(order).toMatchObject({
			localID: expect.any(String),
			id: 1234567890,
			lineItems: [expect.any(String), expect.any(String)],
		});
	});
});
