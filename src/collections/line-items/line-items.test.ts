// import { TestScheduler } from 'rxjs/testing';
import { skip } from 'rxjs/operators';
import { isRxDocument, isRxCollection } from 'rxdb';
import { DatabaseService } from '../../service';

describe('Line Items Collection', () => {
	let subscription: any = null;
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getStoreDB('test');
	});

	afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should be a valid RxCollection', async () => {
		expect(isRxCollection(db.line_items)).toBe(true);
		expect(db.line_items.name).toBe('line_items');
	});

	it('should insert a new Line Item document', async () => {
		const lineItem = await db.line_items.insert({
			name: 'Product',
		});
		expect(isRxDocument(lineItem)).toBe(true);

		// check default
		expect(lineItem).toMatchObject({
			localID: expect.any(String),
			name: 'Product',
		});
	});

	it('should calculate the quantity * price', async (done) => {
		const lineItem = await db.line_items.insert({
			quantity: 1,
			price: 1.23,
		});

		subscription = lineItem.$.subscribe((result) => {
			expect(result).toMatchObject({
				quantity: 1,
				price: 1.23,
				total: '1.23',
			});

			done();
		});
	});

	it('should update on quantity change', async (done) => {
		const lineItem = await db.line_items.findOne('12345').exec();

		subscription = lineItem.$.subscribe((result) => {
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
