import { sitesLiteral } from './schemas/sites';

describe('sites migration strategy', () => {
	it.each([5, 6])('migration %i leaves existing documents unchanged', async (version) => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.sites.migrationStrategies?.[version];
		if (!migrate) throw new Error(`sites migration ${version} missing`);
		const oldDoc = { uuid: 'site-1' };

		expect(migrate(oldDoc, undefined as never)).toBe(oldDoc);
	});

	it('uses schema version 6', () => {
		expect(sitesLiteral.version).toBe(6);
	});
});

describe('sites schema and the site payload', () => {
	it('keeps search_meta_keys from wcpos/v2/site through the schema prune (#2411)', async () => {
		const { pruneProperties } = await import('../plugins/parse-rest-response');
		const data: Record<string, unknown> = {
			uuid: 'site-1',
			search_meta_keys: { customers: ['loyalty_number'], orders: [] },
			not_in_schema: true,
		};
		pruneProperties(sitesLiteral as never, data);
		expect(data).toEqual({
			uuid: 'site-1',
			search_meta_keys: { customers: ['loyalty_number'], orders: [] },
		});
	});
});
