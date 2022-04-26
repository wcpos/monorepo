import { isObservable } from 'rxjs';
import { take } from 'rxjs/operators';
import { isRxDocument } from 'rxdb';
import { DatabaseService } from '../../service';

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
			localID: expect.any(String), // generated local id
			displayName: 'John',
		});
	});

	it('should have method to add site by url', async () => {
		const userDoc = await db.users.findOne().where('displayName').equals('John').exec();
		expect(isRxDocument(userDoc)).toBe(true);
		const siteDoc = await userDoc.addSiteByUrl('example.com');
		expect(isRxDocument(userDoc)).toBe(true);
		expect(userDoc.sites).toContain(siteDoc.localID);
	});

	it('should have an observable for the sites array', async (done) => {
		const userDoc = await db.users.findOne().where('displayName').equals('John').exec();
		expect(isObservable(userDoc.getSites_$())).toBe(true);
		let count = 1;

		userDoc
			.getSites_$()
			.pipe(take(2))
			.subscribe({
				next: (array) => {
					if (count === 1) {
						expect(array.length).toBe(1);
						expect(isRxDocument(array[0])).toBe(true);
						expect(array[0].url).toBe('example.com');
						count++;
					} else if (count === 2) {
						expect(array.length).toBe(2);
						expect(isRxDocument(array[1])).toBe(true);
						expect(array[1].url).toBe('example2.com');
					}
				},
				complete: () => done(),
			});

		await userDoc.addSiteByUrl('example2.com');
	});

	it('should have a method to remove site by id', async () => {
		const userDoc = await db.users.findOne().where('displayName').equals('John').exec();
		expect(userDoc.sites.length).toBe(2);
		const sites = await userDoc.populate('sites');
		expect(sites.length).toBe(2);
		await userDoc.removeSite(userDoc.sites[1]);
		expect(userDoc.sites.length).toBe(1);
		const updatedSites = await userDoc.populate('sites');
		expect(updatedSites.length).toBe(1);
	});
});
