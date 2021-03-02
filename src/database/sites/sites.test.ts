import { isRxDocument } from 'rxdb/plugins/core';
import { DatabaseService } from '../service';

describe('Sites Collection', () => {
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getUserDB();
	});

	// afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should create new documents with default data', async () => {
		const siteDoc = await db.sites.insert({ url: 'example.com' });
		expect(isRxDocument(siteDoc)).toBe(true);
		expect(siteDoc).toMatchObject({
			localId: expect.any(String),
			url: 'example.com',
		});
	});
});
