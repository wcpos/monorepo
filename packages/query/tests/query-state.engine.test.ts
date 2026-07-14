import { firstValueFrom, type Observable } from 'rxjs';
import { filter, take, timeout } from 'rxjs/operators';

import { createEngineDatabase, engineProduct } from './helpers/engine';
import { Query } from '../src/query-state';
import { RelationalQuery } from '../src/relational-query-state';

import type { RxDatabase } from 'rxdb';

// Ruling 6 (ADR 0023 increment 1b): the fluent surface, exercised THROUGH the
// engine-adapter. Fixtures are engine-shaped documents (id=uuid primary, woo id +
// promoted columns, raw body under `payload`) inserted into engine-schema
// collections; the assertions test the SAME fluent behaviors as the local path.

describe('Query (engine-backed via the adapter)', () => {
	let engineDB: RxDatabase;

	beforeEach(async () => {
		engineDB = await createEngineDatabase(['products']);
	});

	afterEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, 50));
		if (engineDB && !engineDB.destroyed) {
			await engineDB.remove();
		}
	});

	const newQuery = (initialParams: any) =>
		new Query({
			id: 'engine-query',
			collection: engineDB.collections.products,
			collectionName: 'products',
			initialParams,
		});

	it('keys hits on the legacy uuid and wraps documents in the legacy read contract', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'a', id: 1, name: 'Apple', price: '1.50' }),
			engineProduct({ uuid: 'b', id: 2, name: 'Banana', price: '0.75' }),
		]);

		const query = newQuery({ sort: [{ name: 'asc' }] });
		const result = await firstValueFrom(
			query.result$.pipe(
				filter((r) => r.count === 2),
				take(1)
			)
		);

		expect(result.searchActive).toBe(false);
		expect(result.hits.map((hit) => hit.id)).toEqual(['a', 'b']);
		// The wrapped document exposes the legacy field shape from payload.
		expect((result.hits[0].document as any).name).toBe('Apple');
		expect((result.hits[0].document as any).price).toBe('1.50');
		expect((result.hits[0].document as any).id).toBe(1); // legacy id = woo id
		await query.cancel();
	});

	it('translates a promoted-column selector', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'a', id: 1, name: 'In', stock_status: 'instock' }),
			engineProduct({ uuid: 'b', id: 2, name: 'Out', stock_status: 'outofstock' }),
		]);

		const query = newQuery({ selector: { stock_status: 'instock' } });
		const result = await firstValueFrom(
			query.result$.pipe(
				filter((r) => r.count >= 1),
				take(1)
			)
		);
		expect(result.hits.map((hit) => hit.id)).toEqual(['a']);
		await query.cancel();
	});

	it('applies a finite-ID ($in) selector translated onto the woo id column', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'a', id: 10, name: 'Ten' }),
			engineProduct({ uuid: 'b', id: 20, name: 'Twenty' }),
			engineProduct({ uuid: 'c', id: 30, name: 'Thirty' }),
		]);

		const query = newQuery({});
		query.where('id').in([10, 30]).exec();
		const result = await firstValueFrom(
			query.result$.pipe(
				filter((r) => r.count === 2),
				take(1)
			)
		);
		expect(result.hits.map((hit) => hit.id).sort()).toEqual(['a', 'c']);
		await query.cancel();
	});

	it('numeric-sorts via the computed sortable_price', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'a', id: 1, name: 'A', price: '100.00' }),
			engineProduct({ uuid: 'b', id: 2, name: 'B', price: '9.99' }),
			engineProduct({ uuid: 'c', id: 3, name: 'C', price: '25.00' }),
		]);

		const query = newQuery({ sort: [{ sortable_price: 'asc' }] });
		const result = await firstValueFrom(
			query.result$.pipe(
				filter((r) => r.count === 3),
				take(1)
			)
		);
		expect(result.hits.map((hit) => hit.id)).toEqual(['b', 'c', 'a']);
		await query.cancel();
	});

	it('reacts to engine inserts', async () => {
		await engineDB.collections.products.insert(engineProduct({ uuid: 'a', id: 1, name: 'A' }));
		const query = newQuery({ sort: [{ name: 'asc' }] });
		await firstValueFrom(
			query.result$.pipe(
				filter((r) => r.count === 1),
				take(1)
			)
		);

		await engineDB.collections.products.insert(engineProduct({ uuid: 'b', id: 2, name: 'B' }));
		const result = await firstValueFrom(
			query.result$.pipe(
				filter((r) => r.count === 2),
				take(1)
			)
		);
		expect(result.hits.map((hit) => hit.id)).toEqual(['a', 'b']);
		await query.cancel();
	});

	it('extracts legacy UUIDs from engine documents during direct relational search', async () => {
		const collection = engineDB.collections.products;
		const product = await collection.insert(
			engineProduct({ uuid: 'direct-match', id: 7, name: 'Blue Shirt' })
		);
		collection.initSearch = async () => ({ collection, find: async () => [product] });
		const childQuery = newQuery({});
		const parentLookupQuery = newQuery({ selector: { id: { $in: [] } } });
		const query = new RelationalQuery(
			{
				id: 'relational-engine-query',
				collection,
				collectionName: 'products',
				initialParams: {},
			},
			childQuery,
			parentLookupQuery
		);
		const directSearch = query as unknown as {
			searchParentsDirect(term: string): Observable<string[]>;
		};

		await expect(firstValueFrom(directSearch.searchParentsDirect('shirt'))).resolves.toEqual([
			'direct-match',
		]);
		await Promise.all([query.cancel(), childQuery.cancel(), parentLookupQuery.cancel()]);
	});

	it('emits relational child-count changes after search demand settles', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'parent', id: 7, name: 'Shirt' })
		);
		const query = newQuery({});
		query.currentRxQuery.other.relationalSearch = {
			searchTerm: 'blue',
			countsByParent: { 7: 1 },
		};
		query.exec();
		await firstValueFrom(
			query.result$.pipe(filter((result) => result.hits[0]?.childrenSearchCount === 1))
		);

		const updated = firstValueFrom(
			query.result$.pipe(
				filter((result) => result.hits[0]?.childrenSearchCount === 2),
				timeout(500)
			)
		);
		query.currentRxQuery.other.relationalSearch = {
			searchTerm: 'blue',
			countsByParent: { 7: 2 },
		};
		query.exec();

		await expect(updated).resolves.toMatchObject({ searchActive: false });
		await query.cancel();
	});
});
