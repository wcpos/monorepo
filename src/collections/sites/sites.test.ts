import { isRxDocument } from 'rxdb';
import { DatabaseService } from '../../service';
import { ConnectionService } from './service';

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
			localID: expect.any(String),
			url: 'example.com',
		});
	});

	it('should have a getter for the connection service', async () => {
		const siteDoc = await db.sites.findOne({ selector: { url: 'example.com' } }).exec();
		expect(isRxDocument(siteDoc)).toBe(true);
		expect(siteDoc.connection).toBeInstanceOf(ConnectionService);
		const { connection } = siteDoc;
		expect(connection).toBe(siteDoc.connection); // check against re-initialisation
	});

	it('should connect to the url', async () => {
		const siteDoc = await db.sites.findOne({ selector: { url: 'example.com' } }).exec();
		expect(isRxDocument(siteDoc)).toBe(true);
		await siteDoc.connect();
		expect(siteDoc).toMatchObject({
			localID: expect.any(String),
			url: 'example.com',
			name: 'Test Site',
		});
	});
});
