import { isRxDocument } from 'rxdb';
import { DatabaseService } from '../../service';

describe('Stores Collection', () => {
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getUserDB();
	});

	// afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should create new documents with default data', async () => {
		const storeDoc = await db.stores.insert({ name: 'Example Store' });
		expect(isRxDocument(storeDoc)).toBe(true);
		expect(storeDoc).toMatchObject({
			localID: expect.any(String),
			name: 'Example Store',
		});
	});
});
