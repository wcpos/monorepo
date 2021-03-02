import { isRxDocument } from 'rxdb/plugins/core';
import { DatabaseService } from '../service';

describe('Users Collection', () => {
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getUserDB();
	});

	// afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should create new documents with default data', async () => {
		const userDoc = await db.users.insert({ displayName: 'John' });
		expect(isRxDocument(userDoc)).toBe(true);
		expect(userDoc).toMatchObject({
			localId: expect.any(String),
			displayName: 'John',
		});
	});

	it('should insert new site (one-to-many)', async () => {
		const userDoc = await db.users.insert({ sites: [{ url: 'example.com' }] });
		expect(isRxDocument(userDoc)).toBe(true);
		const sites = await db.sites.find().exec();
		console.log(sites);
	});
});
