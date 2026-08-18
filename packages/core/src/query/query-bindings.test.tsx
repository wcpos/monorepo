/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { useObservableSuspense } from 'observable-hooks';
import { filter, firstValueFrom } from 'rxjs';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';
import { QueryProvider, useQueryRuntime } from '@wcpos/query';
import type { QueryResult } from '@wcpos/query';
import {
	createEngineDatabase,
	createFakeEngine,
	createPendingFakeEngine,
	engineOrder,
	engineProduct,
	engineVariation,
} from '@wcpos/query/testing';
import type { FakeEngine } from '@wcpos/query/testing';

import {
	useAllCategoriesBinding,
	useAppliedCouponReferenceDemand,
	useCollectionBinding,
	useLogsBinding,
	useRelationalCollectionBinding,
	useSearchSelect,
} from './query-bindings';
import { createStoreDatabase } from '../../../query/tests/helpers/db';

import type { QueryStateOf } from './query-state-types';
import type { RxCollection, RxDatabase } from 'rxdb';

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', {
	configurable: true,
	value: webcrypto,
});

type Resource = ReturnType<typeof useCollectionBinding<'products'>>['resource'];

function current(resource: Resource): QueryResult<RxCollection> | undefined {
	return resource.valueRef$$.value?.current as QueryResult<RxCollection> | undefined;
}

function installResidentSearch(collection: RxCollection): void {
	type SearchOptions = {
		documentSnapshot?: (document: unknown) => Record<string, unknown>;
	};
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
	let manager: ReturnType<typeof useQueryRuntime> | undefined;

	function ManagerCapture() {
		manager = useQueryRuntime();
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
		renderHook(() => useQueryRuntime(), { wrapper: Provider });

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
			engineProduct({
				uuid: 'other',
				id: 3,
				name: 'Other',
				price: '30',
				categories: [{ id: 9 }],
			}),
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
			state: {
				...base,
				search: 'coffee',
				filters: { ...base.filters, tags: [] },
			},
		});
		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['coffee'])
		);
	});

	it('declares nothing and serves empty for a grouped product with no grouped products', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'resident', id: 1, name: 'Resident product' })
		);
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'id', direction: 'asc' },
			limit: 1,
		};
		const { result } = renderHook(
			() => useCollectionBinding('products', state, { remoteIds: [] }),
			{
				wrapper: Provider,
			}
		);

		await waitFor(() => expect(current(result.current.resource)?.hits).toEqual([]));
		expect(engine.requireCalls).toEqual([]);
	});

	it('re-declares the footer binding current descriptor after a reset generation bump', async () => {
		const base: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [7], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};
		const { rerender } = renderHook(({ state }) => useCollectionBinding('products', state), {
			wrapper: Provider,
			initialProps: { state: base },
		});
		await waitFor(() => expect(engine.requireCalls).toHaveLength(1));

		rerender({
			state: { ...base, filters: { ...base.filters, categories: [9] } },
		});
		await waitFor(() => expect(engine.requireCalls).toHaveLength(2));
		act(() => engine.setCollectionStatus('products', { coverageGeneration: 1 }));

		await waitFor(() => expect(engine.requireCalls).toHaveLength(3));
		expect(engine.requireCalls.at(-1)).toEqual(
			expect.objectContaining({ kind: 'product-browse', category: [9] })
		);
	});

	it('recovers from a query error when the descriptor changes', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'coffee', id: 1, name: 'Coffee' })
		);
		const base: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};
		const { result, rerender } = renderHook(
			({ state }) => useCollectionBinding('products', state),
			{ wrapper: Provider, initialProps: { state: base } }
		);
		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));

		const products = engineDB.collections.products;
		(products as unknown as { initSearch: () => Promise<never> }).initSearch = async () => {
			throw new Error('search index failed');
		};
		rerender({ state: { ...base, search: 'broken' } });
		await waitFor(() =>
			expect(() => result.current.resource.read()).toThrow('search index failed')
		);

		installResidentSearch(products);
		rerender({ state: { ...base, search: 'coffee' } });
		await waitFor(() =>
			expect(result.current.resource.read().hits.map((hit) => hit.id)).toEqual(['coffee'])
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
			options: { remoteIds: import('@wcpos/sync-core').RemoteId[] }
		) => ReturnType<typeof useCollectionBinding<'variations'>>;
		const { result } = renderHook(
			() => bindTargeted('variations', state, { remoteIds: ['11', '12'] as never }),
			{
				wrapper: Provider,
			}
		);

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['red-small'])
		);
		expect(
			engine.requireCalls.find(
				(requirement) =>
					requirement.collection === 'variations' && requirement.kind === 'targeted-records'
			)
		).toMatchObject({ remoteIds: ['11', '12'] });
	});

	it('keeps an any variation when the attribute residual admits its missing attribute', async () => {
		await engineDB.collections.variations.bulkInsert([
			engineVariation({
				uuid: 'red-small',
				id: 11,
				parent_id: 10,
				attributes: [{ id: 1, name: 'Color', option: 'Red' }],
			}),
			engineVariation({
				uuid: 'any-color',
				id: 12,
				parent_id: 10,
				attributes: [{ id: 2, name: 'Size', option: 'Large' }],
			}),
		]);
		const state: QueryStateOf<'variations'> = {
			search: '',
			filters: { attributeMatches: [{ id: 1, name: 'Color', option: 'Red' }] },
			sort: { field: 'id', direction: 'asc' },
			limit: Number.MAX_SAFE_INTEGER,
		};
		const { result } = renderHook(() => useCollectionBinding('variations', state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual([
				'red-small',
				'any-color',
			])
		);
	});

	it('returns all, excludes conflicts, and clears stale variation rows as attributes change', async () => {
		await engineDB.collections.variations.bulkInsert([
			engineVariation({
				uuid: 'red-large',
				id: 11,
				parent_id: 10,
				name: 'Red Large',
				attributes: [
					{ id: 1, name: 'Color', option: 'Red' },
					{ id: 2, name: 'Size', option: 'Large' },
				],
			}),
			engineVariation({
				uuid: 'blue-large',
				id: 12,
				parent_id: 10,
				name: 'Blue Large',
				attributes: [
					{ id: 1, name: 'Color', option: 'Blue' },
					{ id: 2, name: 'Size', option: 'Large' },
				],
			}),
			engineVariation({
				uuid: 'red-small',
				id: 13,
				parent_id: 10,
				name: 'Red Small',
				attributes: [
					{ id: 1, name: 'Color', option: 'Red' },
					{ id: 2, name: 'Size', option: 'Small' },
				],
			}),
		]);
		const base: QueryStateOf<'variations'> = {
			search: '',
			filters: { attributeMatches: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: Number.MAX_SAFE_INTEGER,
		};
		const bindTargeted = useCollectionBinding as unknown as (
			collection: 'variations',
			queryState: QueryStateOf<'variations'>,
			options: { remoteIds: import('@wcpos/sync-core').RemoteId[] }
		) => ReturnType<typeof useCollectionBinding<'variations'>>;
		const { result, rerender } = renderHook(
			({ state }) => bindTargeted('variations', state, { remoteIds: ['11', '12', '13'] as never }),
			{ wrapper: Provider, initialProps: { state: base } }
		);

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual([
				'blue-large',
				'red-large',
				'red-small',
			])
		);

		rerender({
			state: {
				...base,
				filters: {
					attributeMatches: [
						{ id: 1, name: 'Color', option: 'Red' },
						{ id: 2, name: 'Size', option: 'Large' },
					],
				},
			},
		});
		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['red-large'])
		);

		rerender({
			state: {
				...base,
				filters: {
					attributeMatches: [
						{ id: 1, name: 'Color', option: 'Green' },
						{ id: 2, name: 'Size', option: 'Large' },
					],
				},
			},
		});
		await waitFor(() => expect(current(result.current.resource)?.hits).toEqual([]));
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

		renderHook(() => useCollectionBinding('orders', state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(
				engine.requireCalls.find(
					(requirement) => requirement.kind === 'orders-browse' && requirement.search === 'smith'
				)
			).toMatchObject({
				collection: 'orders',
				kind: 'orders-browse',
				status: 'processing',
				customerId: 42,
				cashierId: 7,
				store: '12',
				afterSeconds: 1782864000,
				beforeSeconds: 1783987200,
				orderby: 'date',
				order: 'desc',
				search: 'smith',
				limit: 50,
			})
		);
	});

	/**
	 * The lane rows themselves are the ENGINE's business — precedence, freshness and the
	 * ranged-walk cursor are settled behind `coverageChanges` and covered against real storage
	 * in packages/sync-engine. What these fixtures pin is the half that stayed here: which
	 * coverage TARGET a given query state resolves to, and how a verdict is composed with the
	 * resident count. So the fixture seeds the verdict for the exact key it expects the binding
	 * to ask about — seeding the wrong key is indistinguishable from asking the wrong question.
	 */
	async function expectCoverageTotalSource(
		queryKey: string,
		filters: QueryStateOf<'orders'>['filters']
	) {
		engine.setCoverageVerdict(
			{ collection: 'orders', queryKey },
			{ total: 2, source: 'lane', complete: true, fresh: true }
		);
		const { result } = renderHook(
			() =>
				useCollectionBinding('orders', {
					search: '',
					filters,
					sort: { field: 'date_created_gmt', direction: 'desc' },
					limit: 25,
				}),
			{ wrapper: Provider }
		);

		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');
	}

	it('uses coverage for an order status and date-range selector', async () => {
		await expectCoverageTotalSource(
			'orders:browser:status=processing:after=1782864000:before=1783987200:orderby=date:order=desc:search=:limit=25',
			{
				status: 'processing',
				dateRange: { from: '2026-07-01', to: '2026-07-14' },
			}
		);
	});

	it('uses coverage for an order status and customer selector', async () => {
		await expectCoverageTotalSource(
			'orders:browser:status=processing:customer=42:orderby=date:order=desc:search=:limit=25',
			{ status: 'processing', customer_id: 42 }
		);
	});

	// #954: an incomplete ranged lane reports progress and NO total — the reports progress line
	// reads downloaded-vs-total off the same verdict the footer projects its total from, so the
	// two can never disagree. (The downloadedRecords fallback that produces `downloaded: 3` from
	// a cursor-less-count lane is the engine's rule; it is pinned in packages/sync-engine.)
	it('reports ranged download progress while a fetch-to-completion lane carries a cursor', async () => {
		const queryKey =
			'orders:browser:status=processing:after=1782864000:before=1783987200:orderby=date:order=desc:search=:limit=25';
		engine.setCoverageVerdict(
			{ collection: 'orders', queryKey },
			{ complete: false, fresh: true, progress: { downloaded: 3, total: 30_000 } }
		);
		const { result } = renderHook(
			() =>
				useCollectionBinding('orders', {
					search: '',
					filters: {
						status: 'processing',
						dateRange: { from: '2026-07-01', to: '2026-07-14' },
					},
					sort: { field: 'date_created_gmt', direction: 'desc' },
					limit: 25,
				}),
			{ wrapper: Provider }
		);

		await expect(
			firstValueFrom(result.current.laneProgress$.pipe(filter((progress) => progress !== null)))
		).resolves.toEqual({ downloaded: 3, total: 30_000 });
	});

	it('reports no ranged progress once the lane has nothing left to resume', async () => {
		const queryKey =
			'orders:browser:status=processing:after=1782864000:before=1783987200:orderby=date:order=desc:search=:limit=25';
		engine.setCoverageVerdict(
			{ collection: 'orders', queryKey },
			{ total: 1, source: 'lane', complete: true, fresh: true, progress: null }
		);
		const { result } = renderHook(
			() =>
				useCollectionBinding('orders', {
					search: '',
					filters: {
						status: 'processing',
						dateRange: { from: '2026-07-01', to: '2026-07-14' },
					},
					sort: { field: 'date_created_gmt', direction: 'desc' },
					limit: 25,
				}),
			{ wrapper: Provider }
		);

		await expect(firstValueFrom(result.current.laneProgress$)).resolves.toBeNull();
	});

	// The lane may only stand in for the grid's total when the descriptor carries EVERY
	// condition in the selector. A bound the encoder cannot resolve to epoch seconds is
	// dropped from the key, so the lane it names is the UNRANGED browse — reporting its
	// size would over-count the ranged grid.
	it('keeps the total local when a range bound is not representable in the descriptor', async () => {
		const unrangedKey = 'orders:browser:status=processing:orderby=date:order=desc:search=:limit=25';
		engine.setCoverageVerdict(
			{ collection: 'orders', queryKey: unrangedKey },
			{ total: 2, source: 'lane', complete: true, fresh: true }
		);
		const { result } = renderHook(
			() =>
				useCollectionBinding('orders', {
					search: '',
					filters: {
						status: 'processing',
						dateRange: { from: 'nope', to: 'nope' },
					},
					sort: { field: 'date_created_gmt', direction: 'desc' },
					limit: 25,
				}),
			{ wrapper: Provider }
		);

		const sources: string[] = [];
		const subscription = result.current.totalSource$.subscribe((source) => sources.push(source));
		await new Promise((resolve) => setTimeout(resolve, 50));
		subscription.unsubscribe();
		expect(sources.length).toBeGreaterThan(0);
		expect(sources).not.toContain('coverage');
		// Not merely "the answer was local": the binding never ASKED, which is the gate working.
		expect(engine.coverageSubscribeCalls).toEqual([]);
	});

	it('uses coverage for a reports-shaped order selector (cashier, store and range)', async () => {
		await expectCoverageTotalSource(
			'orders:browser:status=completed:cashier=7:store=12:after=1782864000:before=1783987200:orderby=date:order=desc:search=:limit=25',
			{
				status: 'completed',
				cashier: '7',
				store: '12',
				dateRange: { from: '2026-07-01', to: '2026-07-14' },
			}
		);
	});

	it('keeps the current window rendered while an extended limit loads (no re-suspension)', async () => {
		await engineDB.collections.orders.bulkInsert(
			Array.from({ length: 15 }, (_, index) =>
				engineOrder({
					uuid: `order-${index}`,
					id: index + 1,
					date_created_gmt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00`,
				})
			)
		);
		const base: QueryStateOf<'orders'> = {
			search: '',
			filters: {},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 10,
		};
		function OrdersTable({ currentState }: { currentState: QueryStateOf<'orders'> }) {
			const binding = useCollectionBinding('orders', currentState);
			const result = useObservableSuspense(binding.resource);
			return <div data-testid="rows">{result.hits.length}</div>;
		}
		function Screen({ currentState }: { currentState: QueryStateOf<'orders'> }) {
			return (
				<Provider>
					<React.Suspense fallback={<div data-testid="skeleton" />}>
						<OrdersTable currentState={currentState} />
					</React.Suspense>
				</Provider>
			);
		}
		const view = render(<Screen currentState={base} />);
		await waitFor(() => expect(view.getByTestId('rows').textContent).toBe('10'));

		// Infinite scroll: extendLimit bumps the window 10 → 20. The mounted table
		// must keep showing the first page while the wider window loads — the
		// Suspense fallback replacing it is the whole-table flash.
		view.rerender(<Screen currentState={{ ...base, limit: 20 }} />);
		expect(view.queryByTestId('skeleton')).toBeNull();

		await waitFor(() => expect(view.getByTestId('rows').textContent).toBe('15'));
	});

	it('exposes coverage-aware total and totalSource rather than the loaded window', async () => {
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

		// #909: the browse-window coverage key follows the DESCRIPTOR — this grid sorts by
		// name, so it reports against the title-sorted window, not a hardcoded limit=100.
		// Seeding it mid-test is the live flip: the footer must move off the resident count the
		// moment the engine's verdict changes, without a re-render or a re-declare.
		engine.setCoverageVerdict(
			{
				collection: 'products',
				queryKey: 'products:browse-window:limit=100:orderby=title:order=asc',
			},
			{ total: 3, source: 'lane', complete: true, fresh: true }
		);
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

	// A recorded total below the resident count is proven outdated — the projection publishes
	// the resident count instead, and because that number is locally derived it must carry
	// `source: 'local'` (the footer's `N+`), not pose as an exact server total.
	it('demotes to a local lower bound when residents exceed the recorded total', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'resident-1', id: 1, name: 'Resident One' }),
			engineProduct({ uuid: 'resident-2', id: 2, name: 'Resident Two' }),
		]);
		engine.setCoverageVerdict(
			{
				collection: 'products',
				queryKey: 'products:browse-window:limit=100:orderby=title:order=asc',
			},
			{ total: 1, source: 'query-total', complete: false, fresh: false }
		);
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 25,
		};
		const { result } = renderHook(() => useCollectionBinding('products', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(2));
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 2)))
		).resolves.toBe(2);
		await expect(firstValueFrom(result.current.totalSource$)).resolves.toBe('local');

		// The moment the recorded total catches back up, server provenance returns.
		engine.setCoverageVerdict(
			{
				collection: 'products',
				queryKey: 'products:browse-window:limit=100:orderby=title:order=asc',
			},
			{ total: 5, source: 'query-total', complete: false, fresh: false }
		);
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 5)))
		).resolves.toBe(5);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');
	});

	// The POS products grid's own filter shape — `status: 'publish'` on every browse, plus
	// the out-of-stock toggle. `status` carries no key dimension but the fetcher hardcodes
	// `status=publish` on the wire, so this grid must keep its coverage total.
	it('projects browse-window coverage for the POS grid filter shape', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'resident', id: 1, name: 'Resident' })
		);
		engine.setCoverageVerdict(
			{
				collection: 'products',
				queryKey: 'products:browse-window:limit=100:stock_status=instock',
			},
			{ total: 5, source: 'lane', complete: true, fresh: true }
		);

		const posShaped: QueryStateOf<'products'> = {
			search: '',
			filters: {
				categories: [],
				tags: [],
				brands: [],
				status: 'publish',
				stock_status: 'instock',
			},
			sort: { field: 'menu_order', direction: 'asc' },
			limit: 1,
		};
		const { result } = renderHook(() => useCollectionBinding('products', posShaped), {
			wrapper: Provider,
		});
		await waitFor(() => expect(current(result.current.resource)).toBeTruthy());
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 5)))
		).resolves.toBe(5);
	});

	// The browse-window grammar carries category/tag/brand/featured/on_sale/stock_status and
	// nothing else, so a browse ALSO filtered on `status` gets a lane that is a deliberate
	// superset of what the grid shows. Right for demand, wrong for a total — the lane's
	// encoder reports the leftover and the projection falls back to the local count.
	it('ignores browse-window coverage when the products filter is only partly on the wire', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'resident', id: 1, name: 'Resident' })
		);
		// The lane the wire window would fill: stock_status only — `status` never gets there.
		engine.setCoverageVerdict(
			{
				collection: 'products',
				queryKey: 'products:browse-window:limit=100:stock_status=instock',
			},
			{ total: 4, source: 'lane', complete: true, fresh: true }
		);

		const partly: QueryStateOf<'products'> = {
			search: '',
			filters: {
				categories: [],
				tags: [],
				brands: [],
				stock_status: 'instock',
				status: 'draft',
			},
			sort: { field: 'menu_order', direction: 'asc' },
			limit: 1,
		};
		const { result } = renderHook(() => useCollectionBinding('products', partly), {
			wrapper: Provider,
		});
		await waitFor(() => expect(current(result.current.resource)).toBeTruthy());
		const sources: string[] = [];
		const subscription = result.current.totalSource$.subscribe((source) => sources.push(source));
		await new Promise((resolve) => setTimeout(resolve, 20));
		subscription.unsubscribe();
		expect(sources).not.toContain('coverage');
		// The superset lane exists and is fresh; the binding simply never asks about it.
		expect(engine.coverageSubscribeCalls).toEqual([]);
	});

	it('uses coupons:all coverage only for the unfiltered reference lane', async () => {
		await engineDB.collections.coupons.insert({
			uuid: 'coupon-1',
			remoteId: '1',
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
		engine.setCoverageVerdict(
			{ collection: 'coupons', queryKey: 'coupons:all' },
			{ total: 3, source: 'lane', complete: true, fresh: true }
		);
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

	// Tier 0. Tax rates are seeded by the engine's BOOT lane, so requirementsForQuery declares
	// nothing for them and there is no handle to carry a key. The binding must therefore ask
	// through the reference arm and let the engine resolve `taxRates:all` itself — seeding the
	// verdict under `{lane:'reference'}` is what proves it never spells the key out.
	it('projects taxRates:all coverage and idle binding activity for Tier 0', async () => {
		await engineDB.collections.taxRates.insert({
			uuid: 'woo-tax-rate:1',
			remoteId: '1',
			payload: { id: 1, name: 'Standard', class: 'standard' },
			sync: { revision: '1', partial: false, source: 'woo-rest' },
		});
		engine.setCoverageVerdict(
			{ collection: 'taxRates', lane: 'reference' },
			{ total: 2, source: 'lane', complete: true, fresh: true }
		);
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
		// A search lane exists and is complete, but a search is not a browse: the engine hands
		// out no queryKey for it, so the binding has no coverage target and must report the
		// residents it can actually show. The lane is seeded to prove it is IGNORED.
		engine.setCoverageVerdict(
			{ collection: 'customers', queryKey: 'customers:search=ada:limit=10' },
			{ total: 9, source: 'lane', complete: true, fresh: true }
		);
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
			uuid: 'customer-ada',
			remoteId: '103',
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
		expect(engine.coverageSubscribeCalls).toEqual([]);
	});

	// #951. A sorted customers grid declares a browse window, and its footer must report the
	// SERVER's count for that view — a windowed browse is deliberately incomplete, so reading
	// the resident count as the total is the false-complete bug (#894/#945).
	it('reports the server total for a sorted customers browse, not the resident count', async () => {
		await engineDB.collections.customers.insert({
			uuid: 'customer-ada',
			remoteId: '103',
			payload: { id: 103, first_name: 'Ada', last_name: 'Lovelace' },
			sync: { revision: '1', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		// `complete: false` on purpose — a windowed browse never completes, which is exactly
		// why the cached server total, not the lane, has to carry the number.
		engine.setCoverageVerdict(
			{
				collection: 'customers',
				queryKey: 'customers:browse-window:limit=100:orderby=registered_date:order=desc',
			},
			{ total: 4_200, source: 'query-total', complete: false, fresh: true }
		);

		const state: QueryStateOf<'customers'> = {
			search: '',
			filters: {},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 10,
		};
		const { result } = renderHook(() => useCollectionBinding('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));
		expect(engine.requireCalls).toContainEqual(
			expect.objectContaining({
				collection: 'customers',
				kind: 'customer-browse',
				orderby: 'registered_date',
				order: 'desc',
				limit: 10,
			})
		);
		await expect(
			firstValueFrom(result.current.total$.pipe(filter((total) => total === 4_200)))
		).resolves.toBe(4_200);
		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');
	});

	// #1028 follow-on: the plugin proxy (#1488/#1500) now handles last_name, so the grid's
	// DEFAULT sort drives a server-sorted browse window rather than a local-only sort.
	it('declares a browse window for the last_name sort now that the plugin proxies it', async () => {
		await engineDB.collections.customers.insert({
			uuid: 'customer-ada',
			remoteId: '103',
			payload: { id: 103, first_name: 'Ada', last_name: 'Lovelace' },
			sync: { revision: '1', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		const state: QueryStateOf<'customers'> = {
			search: '',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};
		const { result } = renderHook(() => useCollectionBinding('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));
		expect(
			engine.requireCalls.filter((requirement) => requirement.kind === 'customer-browse')
		).toContainEqual(
			expect.objectContaining({ kind: 'customer-browse', orderby: 'last_name', order: 'asc' })
		);
	});

	// role now sorts server-side by staff hierarchy (#1500) — the client passes orderby=role and
	// does NO local rank mapping.
	it('drives a server browse window for the role sort with no client-side rank mapping', async () => {
		await engineDB.collections.customers.insert({
			uuid: 'customer-ada',
			remoteId: '103',
			payload: { id: 103, first_name: 'Ada', last_name: 'Lovelace', role: 'customer' },
			sync: { revision: '1', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		const state: QueryStateOf<'customers'> = {
			search: '',
			filters: {},
			sort: { field: 'role', direction: 'desc' },
			limit: 10,
		};
		const { result } = renderHook(() => useCollectionBinding('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));
		expect(engine.requireCalls).toContainEqual(
			expect.objectContaining({ kind: 'customer-browse', orderby: 'role', order: 'desc' })
		);
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

		renderHook(() => useCollectionBinding('customers', state), {
			wrapper: Provider,
		});
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
			{
				logId: '1',
				timestamp: 1,
				code: 'A',
				level: 'error',
				message: 'one',
			},
			{
				logId: '2',
				timestamp: 2,
				code: 'B',
				level: 'error',
				message: 'two',
			},
			{
				logId: '3',
				timestamp: 3,
				code: 'C',
				level: 'info',
				message: 'three',
			},
		]);
		const state: QueryStateOf<'logs'> = {
			search: '',
			filters: { level: ['error'] },
			sort: { field: 'timestamp', direction: 'desc' },
			limit: 1,
		};
		const { result, rerender } = renderHook(({ currentState }) => useLogsBinding(currentState), {
			wrapper: Provider,
			initialProps: { currentState: state },
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

	it('keeps the current logs window while an extended limit loads instead of blanking', async () => {
		await localDB.collections.logs.bulkInsert([
			{
				logId: '1',
				timestamp: 1,
				code: 'A',
				level: 'error',
				message: 'one',
			},
			{
				logId: '2',
				timestamp: 2,
				code: 'B',
				level: 'error',
				message: 'two',
			},
		]);
		const state: QueryStateOf<'logs'> = {
			search: '',
			filters: {},
			sort: { field: 'timestamp', direction: 'desc' },
			limit: 1,
		};
		const { result, rerender } = renderHook(({ currentState }) => useLogsBinding(currentState), {
			wrapper: Provider,
			initialProps: { currentState: state },
		});
		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(1));
		const initialResource = result.current.resource;

		// Infinite scroll: the limit extends 1 → 2. The mounted table must keep the
		// loaded window (same resource, same value) until the wider query emits —
		// a fresh resource with a synchronous empty first emission blanks the table.
		rerender({ currentState: { ...state, limit: 2 } });

		expect(result.current.resource).toBe(initialResource);
		expect(current(result.current.resource)?.hits).toHaveLength(1);

		await waitFor(() => expect(current(result.current.resource)?.hits).toHaveLength(2));
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
		const { result, rerender } = renderHook(
			({ queryState }) => useRelationalCollectionBinding(queryState),
			{ wrapper: Provider, initialProps: { queryState: state } }
		);
		await waitFor(() =>
			expect(current(result.current.resource)?.hits[0]).toMatchObject({
				id: 'shirt',
				childrenSearchCount: 1,
			})
		);
		expect(current(result.current.resource)?.searchActive).toBe(true);

		rerender({ queryState: { ...state, search: '' } });
		await waitFor(() =>
			expect(Boolean(current(result.current.resource)?.searchActive)).toBe(false)
		);
	});

	it('excludes non-published variation matches from a published product search', async () => {
		await engineDB.collections.products.insert(
			engineProduct({
				uuid: 'shirt',
				id: 10,
				name: 'Shirt',
				status: 'publish',
			})
		);
		await engineDB.collections.variations.insert(
			engineVariation({
				uuid: 'draft-blue-shirt',
				id: 11,
				parent_id: 10,
				name: 'Shirt - Blue',
				sku: 'blue-sku',
				status: 'draft',
			})
		);
		const state: QueryStateOf<'products'> = {
			search: 'blue-sku',
			filters: { categories: [], tags: [], brands: [], status: 'publish' },
			sort: { field: 'name', direction: 'asc' },
			limit: 20,
		};
		const { result } = renderHook(() => useRelationalCollectionBinding(state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current.resource)?.hits.length).toBe(0));
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
				uuid: 'a',
				remoteId: '1',
				payload: { name: 'Alpha' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				uuid: 'b',
				remoteId: '2',
				payload: { name: 'Alpine' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				uuid: 'c',
				remoteId: '3',
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

	it('declares coupon refresh demand when the cart coupon picker binding mounts', async () => {
		renderHook(() => useSearchSelect('coupon'), { wrapper: Provider });

		await waitFor(() =>
			expect(engine.requireCalls).toContainEqual(
				expect.objectContaining({
					collection: 'coupons',
					kind: 'refresh',
					priority: 700,
				})
			)
		);
	});

	it('declares coupon and category demand for a cart that carries applied coupon lines', async () => {
		renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});

		// Replay resolves applied codes AND the category tree by scanning residents directly,
		// so both collections have to be materialized by the cart's own demand (#952).
		await waitFor(() =>
			expect(engine.requireCalls).toContainEqual(
				expect.objectContaining({
					collection: 'coupons',
					kind: 'refresh',
					priority: 700,
				})
			)
		);
		await waitFor(() =>
			expect(engine.requireCalls).toContainEqual(
				expect.objectContaining({
					collection: 'categories',
					kind: 'refresh',
					priority: 700,
				})
			)
		);
	});

	it('declares no reference demand for a cart with no applied coupon lines', async () => {
		renderHook(() => useAppliedCouponReferenceDemand(false), {
			wrapper: Provider,
		});

		await act(async () => Promise.resolve());
		expect(
			engine.requireCalls.filter(
				(call) => call.collection === 'coupons' || call.collection === 'categories'
			)
		).toEqual([]);
	});

	it('waits for another owner mid-pull after its coupon reference handles are ready', async () => {
		const { result } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());
		engine.setCollectionStatus('coupons', { active: true });

		let settled = false;
		const barrier = result.current.whenSettled().then((value) => {
			settled = value;
			return value;
		});
		await act(async () => Promise.resolve());
		expect(settled).toBe(false);

		act(() => engine.setCollectionStatus('coupons', { active: false }));
		await expect(barrier).resolves.toBe(true);
	});

	it('keeps whenSettled pending across a scheduled demand retry', async () => {
		jest.useFakeTimers();
		engine.refreshFailure = new Error('transient refresh failure');
		const { result } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());

		let settled: boolean | undefined;
		const barrier = result.current.whenSettled().then((value) => {
			settled = value;
			return value;
		});
		// Every collection is quiet, so readiness is the only thing holding the barrier.
		// The rejected first declaration must keep it PENDING while the retry is scheduled —
		// settling here would let the coupon replay scan collections that are quiet only
		// because the retry has not started.
		await act(async () => jest.advanceTimersByTimeAsync(100));
		expect(settled).toBeUndefined();

		engine.refreshFailure = undefined;
		await act(async () => jest.advanceTimersByTimeAsync(1_000));
		await expect(barrier).resolves.toBe(true);
	});

	it('settles whenSettled and abandons a scheduled retry on unmount', async () => {
		jest.useFakeTimers();
		engine.refreshFailure = new Error('permanent refresh failure');
		const { result, unmount } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());
		const barrier = result.current.whenSettled();

		await act(async () => jest.advanceTimersByTimeAsync(100));
		unmount();

		await expect(barrier).resolves.toBe(true);
		await act(async () => jest.advanceTimersByTimeAsync(1_000));
		for (const collection of ['coupons', 'categories']) {
			expect(
				engine.requireCalls.filter(
					(call) => call.kind === 'refresh' && call.collection === collection
				)
			).toHaveLength(1);
		}
	});

	it('background wait treats a released outcome as not-attempted and re-declares (#963)', async () => {
		jest.useFakeTimers();
		// Another tab owns the scheduler row: the handle comes back `released` while THAT tab's
		// pull is still in flight, and this tab's activity counters stay quiet throughout.
		engine.refreshReleased = true;
		const { result } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());

		const controller = new AbortController();
		let settled: boolean | undefined;
		const background = result.current.whenSettledInBackground(controller.signal).then((value) => {
			settled = value;
			return value;
		});

		await act(async () => jest.advanceTimersByTimeAsync(30_000));
		// Firing here would replay against still-empty coupon/category residents.
		expect(settled).toBeUndefined();
		const rearms = engine.requireCalls.filter(
			(call) => call.kind === 'refresh' && call.collection === 'coupons'
		).length;
		expect(rearms).toBeGreaterThan(1);

		// The other owner finishes; the next re-declaration is met for real.
		engine.refreshReleased = false;
		await act(async () => jest.advanceTimersByTimeAsync(30_000));
		await expect(background).resolves.toBe(true);
	});

	it('background wait gives up at its cap instead of waiting forever (#963)', async () => {
		jest.useFakeTimers();
		engine.refreshReleased = true;
		const { result } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());

		const controller = new AbortController();
		const background = result.current.whenSettledInBackground(controller.signal);

		// No timers-forever: the cap expires and the next cart edit becomes the self-heal again.
		await act(async () => jest.advanceTimersByTimeAsync(4 * 60_000));
		await expect(background).resolves.toBe(false);
	});

	it('releases pending rearmed requirements when the background cap wins (#963)', async () => {
		jest.useFakeTimers();
		engine.refreshReleased = true;
		const originalRequire = engine.require.bind(engine);
		const releaseRearm = jest.fn();
		engine.require = (requirement) => {
			const handle = originalRequire(requirement);
			if (!requirement.id.includes(':rearm:')) return handle;
			return {
				...handle,
				ready: new Promise(() => undefined),
				release: () => {
					releaseRearm(requirement.collection);
					handle.release();
				},
			};
		};
		const { result } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());

		const controller = new AbortController();
		const background = result.current.whenSettledInBackground(controller.signal);
		await act(async () => jest.advanceTimersByTimeAsync(4 * 60_000));

		await expect(background).resolves.toBe(false);
		expect(releaseRearm.mock.calls.map(([collection]) => collection).sort()).toEqual([
			'categories',
			'coupons',
		]);
	});

	it('background wait abandons itself when the caller aborts (#963)', async () => {
		jest.useFakeTimers();
		engine.refreshReleased = true;
		const { result } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());

		const controller = new AbortController();
		const background = result.current.whenSettledInBackground(controller.signal);
		await act(async () => jest.advanceTimersByTimeAsync(2_000));

		// Unmount / store switch / newer cart edit: the continuation must not outlive its owner.
		controller.abort();
		await act(async () => jest.advanceTimersByTimeAsync(20_000));
		await expect(background).resolves.toBe(false);
	});

	it('binds cashier search-select to eligible customer roles only', async () => {
		await engineDB.collections.customers.bulkInsert([
			{
				uuid: 'cashier-grace',
				remoteId: '7',
				payload: {
					id: 7,
					first_name: 'Grace',
					last_name: 'Hopper',
					role: 'cashier',
				},
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				uuid: 'customer-ada',
				remoteId: '42',
				payload: {
					id: 42,
					first_name: 'Ada',
					last_name: 'Lovelace',
					role: 'customer',
				},
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);

		const { result } = renderHook(() => useSearchSelect('cashier'), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current.resource)?.hits.map((hit) => hit.id)).toEqual(['cashier-grace'])
		);
	});

	/**
	 * RESURRECTED 1.9 GUARD — the successor to
	 * `packages/query/tests/provider.test.tsx` (~:118-170) on the 1.9 line,
	 * "useQuery must never return undefined on initial render":
	 *
	 *   "Components access query.result$ immediately - undefined causes crashes.
	 *    This test catches the bug where useObservableState returns undefined
	 *    before the observable emits."
	 *
	 * `useQuery` no longer exists. The contract moved DOWN a layer into these
	 * binding hooks: every screen that mounts a grid (products.tsx, orders,
	 * customers, tax-rates, the logs viewer, every search-select pill) calls one
	 * of them and immediately destructures `resource`/`result$`/`total$` into a
	 * Suspense boundary on the very first render, before anything has emitted.
	 * A hook that returns `undefined` — or an object with a hole in it — crashes
	 * the screen exactly the way 1.9 did.
	 *
	 * The guard is deliberately at the HOOK level rather than at
	 * `observeEngineQuery`/`useLocalQuery`: the low-level observables were never
	 * what crashed, the value a component destructures was.
	 */
	describe('first render never yields an undefined binding (resurrected 1.9 guard)', () => {
		const BINDING_FIELDS = ['resource', 'result$', 'active$', 'total$', 'totalSource$'] as const;

		const productsState: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};

		type Captured = {
			binding: Record<string, unknown> | undefined;
			/** Whether the resource already held a value during the first render pass. */
			hadValueOnFirstRender: boolean;
		};

		/**
		 * Render a binding hook and capture what it returned on the FIRST render
		 * pass — recorded during the render phase, so the snapshot predates effects
		 * and any emission. The probe destructures the way a real screen does, so an
		 * `undefined` return throws inside render (the 1.9 crash, verbatim).
		 */
		function captureFirstRender(useBinding: () => unknown, value?: FakeEngine): Captured {
			const captured: Captured = { binding: undefined, hadValueOnFirstRender: false };
			let renders = 0;

			function Probe() {
				const binding = useBinding() as Record<string, unknown>;
				renders += 1;
				// What every consuming screen does immediately. If `binding` is
				// undefined this line throws "Cannot destructure property ... of
				// undefined", which is the bug this guard exists to catch.
				const { resource, result$, active$, total$, totalSource$, sync } = binding;
				if (renders === 1) {
					captured.binding = binding;
					captured.hadValueOnFirstRender =
						(resource as Resource | undefined)?.valueRef$$?.value?.current !== undefined;
				}
				return (
					<div>
						{[resource, result$, active$, total$, totalSource$, sync].every(
							(field) => field !== undefined && field !== null
						)
							? 'valid'
							: 'invalid'}
					</div>
				);
			}

			expect(() =>
				render(
					<Provider value={value}>
						<Probe />
					</Provider>
				)
			).not.toThrow();

			return captured;
		}

		function expectUsableBinding(captured: Captured) {
			expect(captured.binding).toBeDefined();
			expect(captured.binding).not.toBeNull();
			for (const field of BINDING_FIELDS) {
				expect(captured.binding?.[field]).toBeDefined();
				expect(captured.binding?.[field]).not.toBeNull();
			}
			// The observables must be subscribable and `sync` callable straight away —
			// "defined" is not enough if the field is a placeholder a consumer cannot use.
			for (const field of ['result$', 'active$', 'total$', 'totalSource$'] as const) {
				expect(typeof (captured.binding?.[field] as { subscribe?: unknown })?.subscribe).toBe(
					'function'
				);
			}
			expect(typeof captured.binding?.sync).toBe('function');
		}

		it.each([
			['products grid', () => useCollectionBinding('products', productsState)],
			[
				'orders grid',
				() =>
					useCollectionBinding('orders', {
						search: '',
						filters: {},
						sort: { field: 'date_created_gmt', direction: 'desc' },
						limit: 10,
					}),
			],
			[
				'customers grid',
				() =>
					useCollectionBinding('customers', {
						search: '',
						filters: {},
						sort: { field: 'last_name', direction: 'asc' },
						limit: 10,
					}),
			],
			[
				'tax-rates',
				() =>
					useCollectionBinding('tax-rates', {
						search: '',
						filters: {},
						sort: { field: 'id', direction: 'asc' },
						limit: 10,
					}),
			],
			['POS relational products grid', () => useRelationalCollectionBinding(productsState)],
			[
				'logs viewer',
				() =>
					useLogsBinding({
						search: '',
						filters: {},
						sort: { field: 'timestamp', direction: 'desc' },
						limit: 10,
					}),
			],
			['customer search-select', () => useSearchSelect('customer')],
			['category search-select', () => useSearchSelect('category')],
			['category tree', () => useAllCategoriesBinding()],
		])('%s is fully populated on its first render', async (_label, useBinding) => {
			const captured = captureFirstRender(useBinding);

			expectUsableBinding(captured);

			await act(async () => {
				await Promise.resolve();
			});
		});

		it('populates the products binding BEFORE the query emits', async () => {
			const captured = captureFirstRender(() => useCollectionBinding('products', productsState));

			// The 1.9 comment verbatim: the crash was the window between mount and the
			// first emission. Assert the binding was usable while that window was open.
			expect(captured.hadValueOnFirstRender).toBe(false);
			expectUsableBinding(captured);

			await act(async () => {
				await Promise.resolve();
			});
		});

		/**
		 * Cold start — the engine's database is still opening, so `active()` is null
		 * and bootstrap demand rejects. This is the real-app window the 1.9 crash
		 * lived in; the bindings must DEGRADE (constructible, empty) rather than
		 * hand a screen `undefined`.
		 */
		it.each([
			['products grid', () => useCollectionBinding('products', productsState)],
			['POS relational products grid', () => useRelationalCollectionBinding(productsState)],
			['customer search-select', () => useSearchSelect('customer')],
		])('%s survives a first render against an unopened engine', async (_label, useBinding) => {
			const pending = createPendingFakeEngine(engineDB);

			const captured = captureFirstRender(useBinding, pending.engine);

			expectUsableBinding(captured);

			await act(async () => {
				pending.open();
				await Promise.resolve();
			});
		});

		it('returns a callable coupon-reference barrier on its first render', async () => {
			let captured: unknown = undefined;
			let renders = 0;

			function Probe() {
				const demand = useAppliedCouponReferenceDemand(true);
				renders += 1;
				// The cart calls `whenSettled()` from an effect that can fire on the
				// same commit as this render.
				const { whenSettled } = demand;
				if (renders === 1) captured = demand;
				return <div>{typeof whenSettled}</div>;
			}

			expect(() =>
				render(
					<Provider>
						<Probe />
					</Provider>
				)
			).not.toThrow();

			expect(captured).toBeDefined();
			expect(typeof (captured as { whenSettled?: unknown })?.whenSettled).toBe('function');

			await act(async () => {
				await Promise.resolve();
			});
		});
	});
});
