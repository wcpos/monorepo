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
		const logDoc = await db.logs.insert({ message: 'Log message' });
		expect(isRxDocument(logDoc)).toBe(true);
		expect(logDoc).toMatchObject({
			localID: expect.any(String),
			date_created_gmt: expect.any(Number),
			message: 'Log message',
		});
	});
});
