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

	it('should have method to add site', async () => {
		const userDoc = await db.users.findOne().where('displayName').equals('John').exec();
		expect(isRxDocument(userDoc)).toBe(true);
		const siteDoc = await userDoc.addSite('example.com');
		expect(isRxDocument(userDoc)).toBe(true);
		expect(userDoc.sites).toContain(siteDoc.localId);
	});
});
