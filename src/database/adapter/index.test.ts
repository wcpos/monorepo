import { checkAdapter, isRxDatabase } from 'rxdb/plugins/core';
import createTestDatabase from '../../../jest/create-test-database';

describe('Database adapter', () => {
	let database = null;

	beforeAll(async () => {
		database = await createTestDatabase();
	});

	// afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => database.destory());

	it('should be a valid adapter', async () => {
		const ok = await checkAdapter('memory');
		expect(ok).toBe(true);
	});

	it('should be a valid database', async () => {
		expect(isRxDatabase(database)).toBe(true);
	});
});
