import { isRxDocument, isRxCollection } from 'rxdb';
import { DatabaseService } from '../../service';

describe('Fee Lines Collection', () => {
	let db: any = null;

	beforeAll(async () => {
		db = await DatabaseService.getStoreDB('test');
	});

	// afterEach(async () => subscription && subscription.unsubscribe());
	afterAll(async () => db?.destroy());

	it('should be a valid RxCollection', async () => {
		// create a collection with the schema
		// await createOrdersCollection(database);
		expect(isRxCollection(db.fee_lines)).toBe(true);
		expect(db.fee_lines.name).toBe('fee_lines');
	});

	it('should insert a new Line Item document', async () => {
		const feeLine = await db.fee_lines.insert({
			name: 'Fee',
		});
		expect(isRxDocument(feeLine)).toBe(true);

		// check defaults
		expect(feeLine).toMatchObject({
			localID: expect.any(String),
			name: 'Fee',
		});
	});
});
