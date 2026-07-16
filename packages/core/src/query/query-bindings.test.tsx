/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { filter, firstValueFrom } from 'rxjs';

import { QueryProvider, useQueryManager } from '@wcpos/query';
import type { QueryResult } from '@wcpos/query';

import {
	coverageLaneSchema,
	engineSyncCollectionCreators,
	queryTotalCacheSchema,
} from '../../../sync-engine/src/testing';
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
	let manager: ReturnType<typeof useQueryManager> | undefined;

	function ManagerCapture() {
		manager = useQueryManager();
		return null;
	}

	beforeEach(async () => {
		manager = undefined;
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase([
			'products',
			'variations',
			'customers',
			'orders',
			'taxRates',
			'categories',
			'coupons',
		]);
		engine = createFakeEngine(engineDB);
		installResidentSearch(localDB.collections.logs);
		installResidentSearch(engineDB.collections.products);
		installResidentSearch(engineDB.collections.variations);
		installResidentSearch(engineDB.collections.customers);
		installResidentSearch(engineDB.collections.orders);
		installResidentSearch(engineDB.collections.taxRates);
		installResidentSearch(engineDB.collections.categories);
		installResidentSearch(engineDB.collections.coupons);
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
				<ManagerCapture />
				{children}
			</QueryProvider>
		);
	}

	it('uses the provider runtime without a fluent query manager surface', () => {
		renderHook(() => useQueryManager(), { wrapper: Provider });

		expect(manager).toBeDefined();
		expect(manager).not.toHaveProperty('registerQuery');
		expect(manager).not.toHaveProperty('queryStates');
	});

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

	it('keeps finite variation ids at the selector root while applying query-state filters', async () => {
		await engineDB.collections.variations.bulkInsert([
			engineVariation({
				uuid: 'red-small',
				id: 11,
				parent_id: 10,
				name: 'Red Small',
				attributes: [{ id: 1, name: 'Color', option: 'Red' }],
			}),
			engineVariation({
				uuid: 'blue-small',
				id: 12,
				parent_id: 10,
				name: 'Blue Small',
				attributes: [{ id: 1, name: 'Color', option: 'Blue' }],
			}),
			engineVariation({
				uuid: 'red-other-parent',
				id: 21,
				parent_id: 20,
				name: 'Red Other Parent',
				attributes: [{ id: 1, name: 'Color', option: 'Red' }],
			}),
		]);
		const state: QueryStateOf<'variations'> = {
			search: '',
			filters: { attributeMatches: [{ id: 1, name: 'Color', option: 'Red' }] },
			sort: { field: 'name', direction: 'asc' },
			limit: Number.MAX_SAFE_INTEGER,
		};
		const bindTargeted = useCollectionBinding as unknown as (
			collection: 'variations',
			queryState: QueryStateOf<'variations'>,
			options: { wooIds: number[] }
		) => ReturnType<typeof useCollectionBinding<'variations'>>;
		const { result } = renderHook(() => bindTargeted('variations', state, { wooIds: [11, 12] }), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['red-small'])
		);
		expect(
			engine.requireCalls.find(
				(requirement) =>
					requirement.collection === 'variations' && requirement.kind === 'targeted-records'
			)
		).toMatchObject({ wooIds: [11, 12] });
	});

	it('declares the orders query descriptor for status/customer/date-filtered windows', async () => {
		const state: QueryStateOf<'orders'> = {
			search: 'smith',
			filters: {
				status: 'processing',
				customer_id: 42,
				cashier: '7',
				store: '12',
				dateRange: { from: '2026-07-01', to: '2026-07-14' },
			},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 50,
		};

		renderHook(() => useCollectionBinding('orders', state), { wrapper: Provider });

		await waitFor(() =>
			expect(
				engine.requireCalls.find(
					(requirement) =>
						requirement.kind === 'query' && requirement.queryKey?.includes('search=smith')
				)
			).toMatchObject({
				collection: 'orders',
				kind: 'query',
				queryKey: 'orders:browser:status=processing:search=smith:limit=50',
			})
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

	it('uses coupons:all coverage only for the unfiltered reference lane', async () => {
		await engineDB.addCollections({
			coverageLanes: { schema: coverageLaneSchema },
			queryTotalCacheEntries: { schema: queryTotalCacheSchema },
		} as never);
		await engineDB.collections.coupons.insert({
			id: 'coupon-1',
			wooId: 1,
			payload: {
				id: 1,
				code: 'SUMMER',
				discount_type: 'percent',
				status: 'publish',
				date_created_gmt: '2026-07-01T00:00:00',
			},
			sync: { revision: '1', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		await engineDB.collections.coverageLanes.insert({
			laneKey: 'coupons::coupons:all',
			collectionName: 'coupons',
			queryKey: 'coupons:all',
			complete: true,
			expectedRecordIds: ['coupon-1', 'coupon-2', 'coupon-3'],
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 2,
		});
		const base: QueryStateOf<'coupons'> = {
			search: '',
			filters: {},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 1,
		};
		const { result, rerender } = renderHook(({ state }) => useCollectionBinding('coupons', state), {
			wrapper: Provider,
			initialProps: { state: base },
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 3)))
		).resolves.toBe(3);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');

		rerender({ state: { ...base, filters: { status: 'publish' } } });
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 1)))
		).resolves.toBe(1);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'local')))
		).resolves.toBe('local');
	});

	it('projects taxRates:all coverage and idle binding activity for Tier 0', async () => {
		await engineDB.addCollections({
			coverageLanes: { schema: coverageLaneSchema },
			queryTotalCacheEntries: { schema: queryTotalCacheSchema },
		} as never);
		await engineDB.collections.taxRates.insert({
			id: 'woo-tax-rate:1',
			wooTaxRateId: 1,
			payload: { id: 1, name: 'Standard', class: 'standard' },
			sync: { revision: '1', partial: false, source: 'woo-rest' },
		});
		await engineDB.collections.coverageLanes.insert({
			laneKey: 'taxRates::taxRates:all',
			collectionName: 'taxRates',
			queryKey: 'taxRates:all',
			complete: true,
			expectedRecordIds: ['woo-tax-rate:1', 'woo-tax-rate:2'],
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 2,
		});
		const state: QueryStateOf<'tax-rates'> = {
			search: '',
			filters: {},
			sort: { field: 'id', direction: 'asc' },
			limit: Number.MAX_SAFE_INTEGER,
		};
		const { result } = renderHook(() => useCollectionBinding('tax-rates', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 2)))
		).resolves.toBe(2);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');

		await expect(firstValueFrom(result.current.active$)).resolves.toBe(false);
	});

	it('keeps customer search cold until engine results land locally and reports local totals', async () => {
		await engineDB.addCollections({
			coverageLanes: { schema: coverageLaneSchema },
			queryTotalCacheEntries: { schema: queryTotalCacheSchema },
		} as never);
		await engineDB.collections.coverageLanes.insert({
			laneKey: 'customers::customers:search=ada:limit=10',
			collectionName: 'customers',
			queryKey: 'customers:search=ada:limit=10',
			complete: true,
			expectedRecordIds: Array.from({ length: 9 }, (_, index) => `customer-${index}`),
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 2,
		});
		const state: QueryStateOf<'customers'> = {
			search: 'ada',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};
		const { result } = renderHook(() => useCollectionBinding('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toEqual([]));
		expect(engine.searchRequireCalls).toHaveLength(1);
		expect(engine.searchRequireCalls[0]?.requirement).toMatchObject({
			collection: 'customers',
			kind: 'search',
			term: 'ada',
			limit: 10,
		});
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 0)))
		).resolves.toBe(0);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'local')))
		).resolves.toBe('local');

		await engineDB.collections.customers.insert({
			id: 'customer-ada',
			wooCustomerId: 103,
			payload: { id: 103, first_name: 'Ada', last_name: 'Lovelace' },
			sync: { revision: '1', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['customer-ada'])
		);
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 1)))
		).resolves.toBe(1);
		expect(engine.searchRequireCalls).toHaveLength(1);
	});

	it('releases direct search demand when its binding unmounts', async () => {
		const state: QueryStateOf<'customers'> = {
			search: 'ada',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};
		const { unmount } = renderHook(() => useCollectionBinding('customers', state), {
			wrapper: Provider,
		});
		await waitFor(() => expect(engine.searchRequireCalls).toHaveLength(1));
		expect(engine.searchRequireCalls[0]?.released).toBe(false);

		unmount();

		expect(engine.searchRequireCalls[0]?.released).toBe(true);
	});

	it('redeclares search demand once after a transient declaration rejection', async () => {
		jest.useFakeTimers();
		engine.searchFailure = new Error('transient search failure');
		const state: QueryStateOf<'customers'> = {
			search: 'ada',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};

		renderHook(() => useCollectionBinding('customers', state), { wrapper: Provider });
		await act(async () => Promise.resolve());
		expect(engine.searchRequireCalls).toHaveLength(1);

		engine.searchFailure = undefined;
		await act(async () => jest.advanceTimersByTimeAsync(1_000));

		expect(engine.searchRequireCalls).toHaveLength(2);
		expect(engine.searchRequireCalls[0]?.released).toBe(true);
		expect(engine.searchRequireCalls[1]?.released).toBe(false);
	});

	it('bounds permanent demand rejection to one redeclaration and returns inactive', async () => {
		jest.useFakeTimers();
		engine.searchFailure = new Error('permanent search failure');
		const state: QueryStateOf<'customers'> = {
			search: 'ada',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};
		const activeValues: boolean[] = [];
		const { result } = renderHook(() => useCollectionBinding('customers', state), {
			wrapper: Provider,
		});
		const subscription = result.current.active$.subscribe((active) => activeValues.push(active));

		await act(async () => Promise.resolve());
		await act(async () => jest.advanceTimersByTimeAsync(1_000));
		await act(async () => jest.advanceTimersByTimeAsync(60_000));

		expect(engine.searchRequireCalls).toHaveLength(2);
		expect(activeValues).toContain(true);
		expect(activeValues.at(-1)).toBe(false);
		subscription.unsubscribe();
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
		const { result, rerender } = renderHook(
			({ currentState }) => useCollectionBinding('logs', currentState),
			{ wrapper: Provider, initialProps: { currentState: state } }
		);
		await waitFor(() =>
			expect(
				(result.current.resource.valueRef$$.value?.current as QueryResult<RxCollection>)?.hits
			).toHaveLength(1)
		);
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 2)))
		).resolves.toBe(2);
		await expect(firstValueFrom(result.current.totalSource$)).resolves.toBe('local');
		await expect(firstValueFrom(result.current.active$)).resolves.toBe(false);

		const syncCalls = [...engine.syncCalls];
		await act(async () => result.current.sync());
		expect(engine.syncCalls).toEqual(syncCalls);

		rerender({ currentState: { ...state, search: 'three', filters: {} } });
		await waitFor(() =>
			expect(
				(result.current.resource.valueRef$$.value?.current as QueryResult<RxCollection>)?.hits
			).toHaveLength(1)
		);
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 1)))
		).resolves.toBe(1);
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

	it('rebinds residents after clear-and-refresh replaces a collection in the same database', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'before-reset', id: 1, name: 'Before reset' })
		);
		const listeners = new Set<(database: RxDatabase | null) => void>();
		const resettingEngine = Object.assign(engine, {
			db$: (listener: (database: RxDatabase | null) => void) => {
				listeners.add(listener);
				listener(engineDB);
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
			<Provider value={resettingEngine}>{children}</Provider>
		);
		const { result } = renderHook(() => useCollectionBinding('products', state), { wrapper });
		await waitFor(() => expect(current(result.current.resource)?.hits[0]?.id).toBe('before-reset'));

		await engineDB.collections.products.remove();
		await engineDB.addCollections({
			products: engineSyncCollectionCreators().products as never,
		});
		act(() => listeners.forEach((listener) => listener(engineDB)));
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'after-refill', id: 2, name: 'After refill' })
		);

		await waitFor(() => expect(current(result.current.resource)?.hits[0]?.id).toBe('after-refill'));
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

	it('keeps relational search reactive while no local matches exist', async () => {
		const state: QueryStateOf<'products'> = {
			search: 'hoodie',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 20,
		};
		const { result } = renderHook(() => useRelationalCollectionBinding(state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toEqual([]));

		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'hoodie', id: 10, name: 'Hoodie' })
		);

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['hoodie'])
		);
	});

	it('windows relational products after considering every matching variation', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'zulu-shirt', id: 10, name: 'Zulu Shirt' }),
			engineProduct({ uuid: 'alpha-shirt', id: 20, name: 'Alpha Shirt' }),
		]);
		await engineDB.collections.variations.bulkInsert([
			engineVariation({
				uuid: 'first-match',
				id: 11,
				parent_id: 10,
				name: 'Shared Match One',
			}),
			engineVariation({
				uuid: 'second-match',
				id: 21,
				parent_id: 20,
				name: 'Shared Match Two',
			}),
		]);
		const state: QueryStateOf<'products'> = {
			search: 'shared match',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 1,
		};
		const { result } = renderHook(() => useRelationalCollectionBinding(state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['alpha-shirt'])
		);
	});

	it('searches every matching child before applying the parent result limit', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'first-shirt', id: 10, name: 'First Shirt' }),
			engineProduct({ uuid: 'later-shirt', id: 20, name: 'Later Shirt' }),
		]);
		await engineDB.collections.variations.bulkInsert([
			engineVariation({
				uuid: 'first-shirt-small',
				id: 11,
				parent_id: 10,
				name: 'First Shirt - Small',
				sku: 'matching-small',
			}),
			engineVariation({
				uuid: 'first-shirt-large',
				id: 12,
				parent_id: 10,
				name: 'First Shirt - Large',
				sku: 'matching-large',
			}),
			engineVariation({
				uuid: 'later-shirt-only-match',
				id: 13,
				parent_id: 20,
				name: 'Later Shirt - Only Match',
				sku: 'matching-later',
			}),
		]);
		const state: QueryStateOf<'products'> = {
			search: 'matching',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 2,
		};
		const { result } = renderHook(() => useRelationalCollectionBinding(state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual([
				'first-shirt',
				'later-shirt',
			])
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

	it('binds cashier search-select to eligible customer roles only', async () => {
		await engineDB.collections.customers.bulkInsert([
			{
				id: 'cashier-grace',
				wooCustomerId: 7,
				payload: { id: 7, first_name: 'Grace', last_name: 'Hopper', role: 'cashier' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				id: 'customer-ada',
				wooCustomerId: 42,
				payload: { id: 42, first_name: 'Ada', last_name: 'Lovelace', role: 'customer' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);

		const { result } = renderHook(() => useSearchSelect('cashier'), { wrapper: Provider });

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['cashier-grace'])
		);
	});
});
