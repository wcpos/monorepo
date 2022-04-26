import { isRxDocument } from 'rxdb';
import { DatabaseService } from '../../service';

describe('Logs Collection', () => {
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
			localID: expect.any(String),
			displayName: 'John',
		});
	});
});
