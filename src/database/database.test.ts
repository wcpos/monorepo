import { isRxDatabase, isRxCollection } from 'rxdb/plugins/core';
import { DatabaseService, checkAdapter } from './service';

describe('Database Service', () => {
	let db: any = null;

	// afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should have the memory adapter', async () => {
		const ok = await checkAdapter('memory');
		expect(ok).toBe(true);
	});

	it('should have method to get the Users database', async () => {
		db = await DatabaseService.getUserDB();
		expect(isRxDatabase(db)).toBe(true);
		expect(db.name).toBe('wcpos-users');
	});

	describe('Users Database', () => {
		it('should have a collection for logs', async () => {
			db = await DatabaseService.getUserDB();
			expect(isRxCollection(db.logs)).toBe(true);
		});

		it('should have a collection for users', async () => {
			db = await DatabaseService.getUserDB();
			expect(isRxCollection(db.users)).toBe(true);
		});
	});

	describe('Stores Database', () => {
		it('should have a collection for products', async () => {
			db = await DatabaseService.getStoreDB('test');
			expect(isRxCollection(db.products)).toBe(true);
		});

		it('should have a collection for orders', async () => {
			db = await DatabaseService.getStoreDB('test');
			expect(isRxCollection(db.orders)).toBe(true);
		});
	});
});
