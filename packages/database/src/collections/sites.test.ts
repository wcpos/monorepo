import { sitesLiteral } from './schemas/sites';

describe('sites migration strategy', () => {
	it('migration 5 leaves existing documents unchanged', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.sites.migrationStrategies?.[5];
		if (!migrate) throw new Error('sites migration 5 missing');
		const oldDoc = { uuid: 'site-1' };

		expect(migrate(oldDoc, undefined as never)).toBe(oldDoc);
	});

	it('migration 6 leaves existing documents unchanged', async () => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.sites.migrationStrategies?.[6];
		if (!migrate) throw new Error('sites migration 6 missing');
		const oldDoc = { uuid: 'site-1' };

		expect(migrate(oldDoc, undefined as never)).toBe(oldDoc);
	});

	it('uses schema version 6', () => {
		expect(sitesLiteral.version).toBe(6);
	});
});
