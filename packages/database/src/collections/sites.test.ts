import { sitesLiteral } from './schemas/sites';

describe('sites migration strategy', () => {
	it('migration 5 leaves existing documents unchanged', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.sites.migrationStrategies?.[5];
		if (!migrate) throw new Error('sites migration 5 missing');
		const oldDoc = { uuid: 'site-1' };

		expect(migrate(oldDoc, undefined as never)).toBe(oldDoc);
	});

	it('uses schema version 5', () => {
		expect(sitesLiteral.version).toBe(5);
	});
});
