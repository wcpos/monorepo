/** @jest-environment node */
import { createRxDatabase } from 'rxdb';
import { firstValueFrom } from 'rxjs';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { compileQuery } from '../../../core/src/query/query-state-translator';
import { executeAdapterQuery } from '../../src/engine-adapter/execute-query';
import { engineProduct, engineVariation } from '../../src/testing';
import { sqlitePlan } from '../helpers/sqlite-plan';
import { storages } from '../helpers/storages';

import type { AdapterDatabase } from '../../src/engine-adapter/execute-query';
import type { RxDatabase } from 'rxdb';

jest.mock('@wcpos/query', () => jest.requireActual('../../src/engine-adapter/translate-selector'));

describe.each(storages)('%s default grid', (name, storage) => {
	let database: RxDatabase;
	afterEach(async () => {
		await database?.close();
	});
	it.each(['products', 'variations'] as const)(
		'pushes the compiled %s page and keeps search-hit order identical',
		async (collection) => {
			database = await createRxDatabase({
				name: `grid-${crypto.randomUUID()}`,
				storage,
				multiInstance: false,
			});
			await database.addCollections({ [collection]: engineSyncCollectionCreators()[collection] });
			const build = collection === 'products' ? engineProduct : engineVariation;
			const fixtures = [
				['z', 'Éclair', 1],
				['b', 'Apple', 2],
				['a', 'apple', 99],
				['c', '_apple', 3],
				['d', 'Zoo', 4],
			] as const;
			await database[collection].bulkInsert(
				fixtures.map(([uuid, title, id]) => build({ uuid, name: title, id }))
			);
			const spy = jest.spyOn(database[collection].storageInstance, 'query');
			const { read } = compileQuery(
				collection,
				{
					search: '',
					filters: { categories: [], tags: [], brands: [] },
					sort: { field: 'name', direction: 'asc' },
					limit: 3,
				},
				{ id: 'grid' }
			);
			const options = { database: database as unknown as AdapterDatabase, collection, read };
			const page = await firstValueFrom(executeAdapterQuery(options));
			expect(page.hits.map((doc) => doc.uuid)).toEqual(['c', 'a', 'b']);
			expect(page.count).toBe(5);
			expect(spy.mock.calls.length).toBeGreaterThan(0);
			expect(spy.mock.calls.every(([prepared]) => prepared.query.limit === 3)).toBe(true);
			const searchPage = await firstValueFrom(
				executeAdapterQuery({ ...options, hitIds: fixtures.map(([uuid]) => uuid).reverse() })
			);
			expect(searchPage.hits.map((doc) => doc.uuid)).toEqual(['c', 'a', 'b']);
			const residualPage = await firstValueFrom(
				executeAdapterQuery({ ...options, read: { ...read, complete: false } })
			);
			expect(residualPage.hits.map((doc) => doc.uuid)).toEqual(['c', 'a', 'b']);
			if (name === 'sqlite') {
				const plan = await sqlitePlan(database[collection], {
					selector: {},
					sort: [{ sortName: 'asc' }, { uuid: 'asc' }],
					limit: 3,
				});
				expect(plan.join('\n')).toContain('sortName');
				expect(plan.join('\n')).not.toContain('USE TEMP B-TREE FOR ORDER BY');
			}
		}
	);
});

// Memory uses UTF-16 ordering; SQLite is the shipping engine and orders by code point.
it('orders 😀 after ｚ on SQLite and in the JS search-hit comparator', async () => {
	const database = await createRxDatabase({
		name: `unicode-${crypto.randomUUID()}`,
		storage: storages[1][1],
		multiInstance: false,
	});
	try {
		await database.addCollections({ products: engineSyncCollectionCreators().products });
		await database.products.bulkInsert([
			engineProduct({ uuid: 'emoji', name: '😀', id: 1 }),
			engineProduct({ uuid: 'fullwidth', name: 'ｚ', id: 2 }),
		]);
		const { read } = compileQuery(
			'products',
			{
				search: '',
				filters: { categories: [], tags: [], brands: [] },
				sort: { field: 'name', direction: 'asc' },
				limit: 2,
			},
			{ id: 'unicode' }
		);
		const options = {
			database: database as unknown as AdapterDatabase,
			collection: 'products' as const,
			read,
		};
		const page = await firstValueFrom(executeAdapterQuery(options));
		const search = await firstValueFrom(
			executeAdapterQuery({ ...options, hitIds: ['emoji', 'fullwidth'] })
		);
		expect(page.hits.map((doc) => doc.uuid)).toEqual(['fullwidth', 'emoji']);
		expect(search.hits.map((doc) => doc.uuid)).toEqual(['fullwidth', 'emoji']);
	} finally {
		await database.close();
	}
});
