/**
 * @jest-environment jsdom
 */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { filter, firstValueFrom } from 'rxjs';

import { QueryProvider } from '@wcpos/query';
import type { QueryResult } from '@wcpos/query';

import { coverageLaneSchema, queryTotalCacheSchema } from '../../../sync-engine/src/testing';
import {
	useCollectionBinding,
	useRelationalCollectionBinding,
	useSearchSelect,
} from './query-bindings';
import { createStoreDatabase } from '../../../query/tests/helpers/db';
import {
	createEngineDatabase,
	createFakeEngine,
	engineProduct,
	engineVariation,
} from '../../../query/tests/helpers/engine';

import type { QueryStateOf } from './query-state-types';
import type { FakeEngine } from '../../../query/tests/helpers/engine';
import type { RxCollection, RxDatabase } from 'rxdb';

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

type Resource = ReturnType<typeof useCollectionBinding<'products'>>['resource'];

function current(resource: Resource): QueryResult<RxCollection> | undefined {
	return resource.valueRef$$.value?.current as QueryResult<RxCollection> | undefined;
}

function installResidentSearch(collection: RxCollection): void {
	type SearchOptions = { documentSnapshot?: (document: unknown) => Record<string, unknown> };
	(
		collection as unknown as {
			initSearch: (locale: string, options?: SearchOptions) => Promise<unknown>;
		}
	).initSearch = async (_locale, options) => ({
		collection,
		find: async (term: string) => {
			const documents = await collection.find().exec();
			const needle = term.toLowerCase();
			return documents.filter((document) => {
				const snapshot = options?.documentSnapshot?.(document) ?? document.toJSON();
				return JSON.stringify(snapshot).toLowerCase().includes(needle);
			});
		},
	});
}

describe('query bindings', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;

	beforeEach(async () => {
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase(['products', 'variations', 'customers', 'categories']);
		engine = createFakeEngine(engineDB);
		installResidentSearch(engineDB.collections.products);
		installResidentSearch(engineDB.collections.variations);
		installResidentSearch(engineDB.collections.customers);
		installResidentSearch(engineDB.collections.categories);
	});

	afterEach(async () => {
		cleanup();
		jest.useRealTimers();
		if (localDB && !localDB.destroyed) await localDB.remove();
		if (engineDB && !engineDB.destroyed) await engineDB.remove();
	});

	function Provider({
		children,
		value = engine,
	}: {
		children: React.ReactNode;
		value?: FakeEngine;
	}) {
		return (
			<QueryProvider localDB={localDB} engine={value} locale="en">
				{children}
			</QueryProvider>
		);
	}

	it('reads engine residents and composes filter, sort, limit, and search', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({
				uuid: 'coffee',
				id: 1,
				name: 'Coffee',
				price: '5',
				categories: [{ id: 7 }],
				tags: [{ id: 6 }],
			}),
			engineProduct({
				uuid: 'tea',
				id: 2,
				name: 'Green Tea',
				price: '20',
				categories: [{ id: 7 }],
				tags: [{ id: 5 }],
			}),
			engineProduct({ uuid: 'other', id: 3, name: 'Other', price: '30', categories: [{ id: 9 }] }),
		]);
		const base: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [7], tags: [5], brands: [] },
			sort: { field: 'price', direction: 'desc' },
			limit: 1,
		};
		const { result, rerender } = renderHook(
			({ state }) => useCollectionBinding('products', state),
			{ wrapper: Provider, initialProps: { state: base } }
		);

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['tea'])
		);

		rerender({
			state: { ...base, search: 'coffee', filters: { ...base.filters, tags: [] } },
		});
		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['coffee'])
		);
	});

	it('exposes coverage-aware total and totalSource rather than the loaded window', async () => {
		await engineDB.addCollections({
			coverageLanes: { schema: coverageLaneSchema },
			queryTotalCacheEntries: { schema: queryTotalCacheSchema },
		} as never);
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'resident', id: 1, name: 'Resident' })
		);
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 1,
		};
		const { result } = renderHook(() => useCollectionBinding('products', state), {
			wrapper: Provider,
		});
		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 1)))
		).resolves.toBe(1);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'local')))
		).resolves.toBe('local');

		await engineDB.collections.coverageLanes.insert({
			laneKey: 'products::products:browse-window:limit=100',
			collectionName: 'products',
			queryKey: 'products:browse-window:limit=100',
			complete: true,
			expectedRecordIds: ['p1', 'p2', 'p3'],
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 2,
		});
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 3)))
		).resolves.toBe(3);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');
		await expect(firstValueFrom(result.current.active$)).resolves.toBe(false);
		await act(async () => result.current.sync());
		expect(engine.syncCalls).toContain('scheduler-drain');
	});

	it('uses the full matching local logs count instead of the loaded window', async () => {
		await localDB.collections.logs.bulkInsert([
			{ logId: '1', timestamp: 1, code: 'A', level: 'error', message: 'one', context: {} },
			{ logId: '2', timestamp: 2, code: 'B', level: 'error', message: 'two', context: {} },
			{ logId: '3', timestamp: 3, code: 'C', level: 'info', message: 'three', context: {} },
		]);
		const state: QueryStateOf<'logs'> = {
			search: '',
			filters: { level: ['error'] },
			sort: { field: 'timestamp', direction: 'desc' },
			limit: 1,
		};
		const { result } = renderHook(() => useCollectionBinding('logs', state), {
			wrapper: Provider,
		});
		await waitFor(() =>
			expect(
				(result.current.resource.valueRef$$.value?.current as QueryResult<RxCollection>)?.hits
			).toHaveLength(1)
		);
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 2)))
		).resolves.toBe(2);
		await expect(firstValueFrom(result.current.totalSource$)).resolves.toBe('local');
	});

	it('rebinds residents when engine db$ moves to another scope', async () => {
		const secondDB = await createEngineDatabase(['products']);
		installResidentSearch(secondDB.collections.products);
		await engineDB.collections.products.insert(engineProduct({ uuid: 'old', id: 1, name: 'Old' }));
		await secondDB.collections.products.insert(engineProduct({ uuid: 'new', id: 2, name: 'New' }));
		let activeDB = engineDB;
		const listeners = new Set<(database: RxDatabase | null) => void>();
		const movingEngine = Object.assign(engine, {
			active: () => ({
				identity: { site: 'test', storeId: '1', cashierId: '1' },
				scopeId: activeDB.name,
				database: activeDB,
			}),
			db$: (listener: (database: RxDatabase | null) => void) => {
				listeners.add(listener);
				listener(activeDB);
				return () => listeners.delete(listener);
			},
		});
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<Provider value={movingEngine}>{children}</Provider>
		);
		const { result } = renderHook(() => useCollectionBinding('products', state), { wrapper });
		await waitFor(() => expect(current(result.current.resource)?.hits[0]?.id).toBe('old'));

		act(() => {
			activeDB = secondDB;
			listeners.forEach((listener) => listener(secondDB));
		});
		await waitFor(() => expect(current(result.current.resource)?.hits[0]?.id).toBe('new'));
		await secondDB.remove();
	});

	it('binds the relational products-to-variations search pair', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'shirt', id: 10, name: 'Shirt' })
		);
		await engineDB.collections.variations.insert(
			engineVariation({
				uuid: 'blue-shirt',
				id: 11,
				parent_id: 10,
				name: 'Shirt - Blue',
				sku: 'blue-sku',
			})
		);
		const state: QueryStateOf<'products'> = {
			search: 'blue-sku',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 20,
		};
		const { result } = renderHook(() => useRelationalCollectionBinding(state), {
			wrapper: Provider,
		});
		await waitFor(() =>
			expect(current(result.current.resource)?.hits[0]).toMatchObject({
				id: 'shirt',
				childrenSearchCount: 1,
			})
		);
	});

	it('debounces search-select input and bounds its resident results', async () => {
		jest.useFakeTimers();
		await engineDB.collections.categories.bulkInsert([
			{
				id: 'a',
				wooId: 1,
				payload: { name: 'Alpha' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				id: 'b',
				wooId: 2,
				payload: { name: 'Alpine' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				id: 'c',
				wooId: 3,
				payload: { name: 'Albatross' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);
		const { result } = renderHook(
			() => useSearchSelect('category', { debounceMs: 50, maxResults: 2 }),
			{ wrapper: Provider }
		);
		act(() => result.current.setSearch('al'));
		expect(result.current.search).toBe('al');
		act(() => jest.advanceTimersByTime(49));
		expect(result.current.committedSearch).toBe('');
		act(() => jest.advanceTimersByTime(1));
		expect(result.current.committedSearch).toBe('al');
		await act(async () => Promise.resolve());
		expect(
			(result.current.resource.valueRef$$.value?.current as QueryResult<RxCollection>)?.hits.length
		).toBeLessThanOrEqual(2);
	});
});
