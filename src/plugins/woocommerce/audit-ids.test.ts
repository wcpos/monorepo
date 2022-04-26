import { isRxDatabase, isRxCollection } from 'rxdb';
import map from 'lodash/map';
import { storeDBPromise } from '../../stores-db';

describe('auditIdsFromServer', () => {
	let db: any;

	beforeAll(async () => {
		db = await storeDBPromise('test');
	});

	it('tests should have access to database', async () => {
		expect(isRxDatabase(db)).toBe(true);
		expect(db.name).toBe('test');
		expect(isRxCollection(db.collections.products)).toBe(true);
		const records = await db.collections.products.find().exec();
		expect(records.length).toBe(0);
	});

	it('should bulkInsert ids into an empty database', async () => {
		await db.collections.products.auditIdsFromServer([{ id: 1 }, { id: 2 }, { id: 3 }]);
		const records = await db.collections.products.find().exec();
		expect(records.length).toBe(3);
	});

	it('should add new ids', async () => {
		const initial = await db.collections.products.find().exec();
		expect(initial.length).toBe(3);
		await db.collections.products.auditIdsFromServer([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
		const records = await db.collections.products.find().exec();
		expect(records.length).toBe(4);
		expect(map(records, 'id').sort()).toEqual([1, 2, 3, 4]);
	});

	it('should remove stale ids', async () => {
		const initial = await db.collections.products.find().exec();
		expect(initial.length).toBe(4);
		await db.collections.products.auditIdsFromServer([{ id: 2 }, { id: 4 }]);
		const records = await db.collections.products.find().exec();
		expect(records.length).toBe(2);
		expect(map(records, 'id').sort()).toEqual([2, 4]);
	});

	it('should not audit unsynced records', async () => {
		const initial = await db.collections.products.find().exec();
		expect(initial.length).toBe(2);
		await db.collections.products.bulkInsert([{ name: 'Product 1' }, { name: 'Product 2' }]);
		await db.collections.products.auditIdsFromServer([{ id: 4 }]);
		const records = await db.collections.products.find().exec();
		expect(records.length).toBe(3);
		expect(map(records, 'id').sort()).toEqual([4, undefined, undefined]);
	});
});
