import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { sitesLiteral } from './schemas/sites';

beforeAll(() => {
	addRxPlugin(RxDBMigrationSchemaPlugin);
});

describe('sites migration strategy', () => {
	it.each([5, 6, 7, 8])('migration %i leaves existing documents unchanged', async (version) => {
		const { userCollections } = await import('./index');
		const migrate = userCollections.sites.migrationStrategies?.[version];
		if (!migrate) throw new Error(`sites migration ${version} missing`);
		const oldDoc = { uuid: 'site-1' };

		expect(migrate(oldDoc, undefined as never)).toBe(oldDoc);
	});

	it('uses schema version 8', () => {
		expect(sitesLiteral.version).toBe(8);
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

describe('a sites collection stored under either shipped v7 schema', () => {
	// Two different v7 schemas shipped: main's 1.11.2 (no search_meta_keys) and next before
	// #2646 (no use_instance_header). Opening either under a same-version schema throws DB6.
	const v7Without = (property: 'search_meta_keys' | 'use_instance_header') => {
		const { [property]: _omitted, ...properties } = sitesLiteral.properties;
		return { ...sitesLiteral, version: 7, properties };
	};

	it.each([
		// Each shape stores the property only it carries, so the reopen proves that value survives.
		['main 1.11.2', 'search_meta_keys', { use_instance_header: true }],
		[
			'next before #2646',
			'use_instance_header',
			{ search_meta_keys: { customers: ['loyalty_number'], orders: ['po_number'] } },
		],
	] as const)('opens a %s database under the current schema', async (_label, missing, own) => {
		const storage = getRxStorageMemory();
		const name = `sites-v7-${missing.replace(/_/g, '-')}`;
		const stored = await createRxDatabase({ name, storage, multiInstance: false });
		await stored.addCollections({ sites: { schema: v7Without(missing) as never } });
		await stored.sites.insert({ uuid: 'site-1', name: 'Store', use_cache_buster: true, ...own });
		await stored.close();

		const { userCollections } = await import('./index');
		const reopened = await createRxDatabase({ name, storage, multiInstance: false });
		try {
			await reopened.addCollections({ sites: userCollections.sites as never });
			const site = await reopened.sites.findOne('site-1').exec();
			const json = site?.toJSON() as Record<string, unknown> | undefined;
			expect(json).toMatchObject({
				uuid: 'site-1',
				name: 'Store',
				use_cache_buster: true,
				...own,
			});
			expect(json).not.toHaveProperty(missing);
		} finally {
			await reopened.close();
		}
	});
});
