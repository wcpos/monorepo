import { isRxDatabase, isRxCollection } from 'rxdb';
import { DatabaseService, checkAdapter, _createUsersDB } from './service';

describe('Database Service', () => {
	let db: any = null;

	// afterEach(async () => subscription && subscription.unsubscribe());
	// afterAll(async () => db?.destroy());

	it('should have the memory adapter', async () => {
		const ok = await checkAdapter('memory');
		expect(ok).toBe(true);
	});

	it('should have method to get the Users database', async () => {
		db = await DatabaseService.getUserDB();
		expect(isRxDatabase(db)).toBe(true);
		expect(db.name).toBe('wcposusers');
	});

	it('should return the same instance of the Users database', async () => {
		db = await DatabaseService.getUserDB();
		const db2 = await DatabaseService.getUserDB();
		expect(db === db2).toBe(true);
		const db3 = await _createUsersDB();
		expect(db === db3).toBe(false);
	});

	it('should have a method to get the Stores database', async () => {
		db = await DatabaseService.getStoreDB('test');
		expect(isRxDatabase(db)).toBe(true);
		expect(db.name).toBe('test');
	});

	it('should return the requested Store database and remove any previous Store DBs', async () => {
		db = await DatabaseService.getStoreDB('test');
		const db2 = await DatabaseService.getStoreDB('test2');
		expect(db.destroyed).toBe(true);
		expect(isRxDatabase(db2)).toBe(true);
		expect(db2?.name).toBe('test2');
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
