// import { TestScheduler } from 'rxjs/testing';
import { skip } from 'rxjs/operators';
import { isRxDocument, isRxCollection } from 'rxdb/plugins/core';
import { DatabaseService } from '../service';

describe('Line Items Collection', () => {
	let subscription: any = null;
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getStoreDB('test');
	});

	afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should be a valid RxCollection', async () => {
		expect(isRxCollection(db.lineItems)).toBe(true);
		expect(db.lineItems.name).toBe('lineItems');
	});

	it('should insert a new Line Item document', async () => {
		const lineItem = await db.lineItems.insert({
			id: 12345,
		});

		expect(lineItem).toMatchObject({
			id: '12345',
		});
	});

	it('should calculate the quantity * price', async (done) => {
		const lineItem = await db.lineItems.findOne('12345').exec();

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
		const lineItem = await db.lineItems.findOne('12345').exec();

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
