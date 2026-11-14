import { registryScopeIdentities, type ScopeRegistryDatabase } from './legacy-scope-registry';

type Row = Record<string, unknown>;
const finder = (rows: Record<string, Row>) => ({
	find: () => ({ exec: async () => Object.values(rows).map((row) => ({ toJSON: () => row })) }),
	findByIds: (ids: string[]) => ({
		exec: async () =>
			new Map(
				ids.filter((id) => id in rows).map((id) => [id, { toJSON: () => rows[id]! }] as const)
			),
	}),
});

describe('the store registry', () => {
	it('names every site × cashier × store scope, and reports references with no document', async () => {
		const db = {
			sites: finder({
				s1: { wp_api_url: 'https://shop.test/wp-json/', wp_credentials: ['c1', 'c-gone'] },
			}),
			wp_credentials: finder({ c1: { id: 7, stores: ['st1', 'st-gone'] } }),
			stores: finder({ st1: { id: 0 } }),
		} as unknown as ScopeRegistryDatabase;
		await expect(registryScopeIdentities(db)).resolves.toEqual({
			scopes: [{ site: 'https://shop.test/wp-json/', storeId: 0, cashierId: 7 }],
			unresolved: ['wp_credentials:c-gone', 'stores:st-gone'],
		});
	});
});
