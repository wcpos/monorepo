import { filter, firstValueFrom } from 'rxjs';

import { acquireSearchSelectHandle } from '../../src/query-state';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';

it.each([
	['customer', 'customers', 'search'],
	['cashier', 'customers', 'search'],
	['category', 'categories', 'refresh'],
	['brand', 'brands', 'refresh'],
	['tag', 'tags', 'refresh'],
	['coupon', 'coupons', 'refresh'],
] as const)(
	'owns the %s picker read and demand until release',
	async (collection, engineCollection, kind) => {
		const database = await createEngineDatabase([engineCollection]);
		const engine = createFakeEngine(database);
		const options = { collection, search: 'alice', limit: 25, searchFields: ['name'] };
		const handle = acquireSearchSelectHandle(engine, 'picker', options);
		expect(engine.requireCalls).toEqual([]);
		const release = handle.retain();
		try {
			await firstValueFrom(handle.observe().pipe(filter((snapshot) => snapshot.ready)));
			expect(handle.value.error).toBeNull();
			expect(handle.value.hits).toEqual([]);
			expect(acquireSearchSelectHandle(engine, 'picker', options)).toBe(handle);
			expect(engine.requireCalls).toEqual([
				expect.objectContaining({
					collection: engineCollection,
					kind,
					...(kind === 'search'
						? { term: 'alice', limit: 25 }
						: { orderby: collection === 'coupon' ? 'title' : 'name', order: 'asc' }),
				}),
			]);
		} finally {
			release();
			await Promise.resolve();
			await database.close();
		}
		expect(engine.demandEvents.some((event) => event.startsWith('release:'))).toBe(true);
	}
);
