import { sitesLiteral } from './schemas/sites';

describe('sites schema', () => {
	it('uses schema version 0', () => {
		expect(sitesLiteral.version).toBe(0);
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
