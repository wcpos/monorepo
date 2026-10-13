/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { distinctUntilChanged, filter, firstValueFrom, map, type Observable } from 'rxjs';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';
import type { RequirementHandle } from '@wcpos/sync-engine';
import { queryHandleAnswers$, QueryProvider, useQueryRuntime } from '@wcpos/query';
import type { QueryHandle, QueryResult, QuerySnapshot } from '@wcpos/query';
import {
	createEngineDatabase,
	createFakeEngine,
	createPendingFakeEngine,
	engineOrder,
	engineProduct,
	engineVariation,
	queryHandleCount,
} from '@wcpos/query/testing';
import type { FakeEngine } from '@wcpos/query/testing';

import { useAppliedCouponReferenceDemand } from './coupon-reference-demand';
import * as queryHandles from './query-handles';
import {
	useCollectionQueryHandle,
	useDrawnHandle,
	useLogsQueryHandle,
	useProductsQueryHandle,
	useQuerySnapshot,
} from './query-handles';
import { useScopeKey } from './scope-key';
import { useSearchSelect } from './search-select';
import {
	EXISTENCE_RECHECK_MS,
	useAllTermsHandle,
	useProductsCarryingTermsHandle,
} from './terms-handles';
import * as queryStateTranslator from './query-state-translator';
import { createStoreDatabase } from '../../../query/tests/helpers/db';

import type { QueryStateOf } from './query-state-types';
import type { RxCollection, RxDatabase } from 'rxdb';

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', {
	configurable: true,
	value: webcrypto,
});

/** A handle's answer, or undefined while it has none. */
function current(handle: QueryHandle): QueryResult<RxCollection> | undefined {
	return handle.value.ready ? handle.value.result : undefined;
}

/** A handle's answer for a `waitFor`: throws while unanswered, and rethrows a failed read. */
function read(handle: QueryHandle): QueryResult<RxCollection> {
	if (handle.value.error) throw handle.value.error;
	if (!handle.value.ready) throw new Error('unanswered');
	return handle.value.result;
}

/**
 * One snapshot field as a stream, as a stream-shaped reader would watch it: `active` and
 * `pending` from the first snapshot, the projections (`total`, `exhausted`, `laneProgress`) only
 * once the read has answered — an unanswered snapshot's `null` is "no answer yet", not a verdict.
 */
function field$<K extends 'active' | 'pending' | 'total' | 'exhausted' | 'laneProgress'>(
	handle: QueryHandle,
	name: K
): Observable<QuerySnapshot[K]> {
	return handle.observe().pipe(
		filter((snapshot) => name === 'active' || name === 'pending' || snapshot.ready),
		map((snapshot) => snapshot[name]),
		distinctUntilChanged()
	);
}

/** A handle's answered ids, sorted; undefined while it has not answered. */
function answeredIds(handle: QueryHandle): string[] | undefined {
	return handle.value.ready ? handle.value.hits.map((hit) => hit.id).sort() : undefined;
}

describe('query handles over the engine', () => {
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
			'refunds',
			'taxRates',
			'categories',
			'coupons',
		]);
		engine = createFakeEngine(engineDB);
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

	it('preserves the compiled descriptor for deeply equal inputs and replaces it for new state', () => {
		const compileQuery = jest.spyOn(queryStateTranslator, 'compileQuery');
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'id', direction: 'asc' },
			limit: 10,
		};
		const { rerender } = renderHook(
			({ currentState, remoteIds }) =>
				useCollectionQueryHandle('products', currentState, { remoteIds }),
			{
				wrapper: Provider,
				initialProps: { currentState: state, remoteIds: ['1', '2'] as never[] },
			}
		);
		const initialCompiled = compileQuery.mock.results.at(-1)?.value;

		rerender({ currentState: state, remoteIds: ['1', '2'] as never[] });
		expect(compileQuery.mock.results.at(-1)?.value).toBe(initialCompiled);
		expect(compileQuery).toHaveBeenCalledTimes(1);

		rerender({ currentState: { ...state, search: 'coffee' }, remoteIds: ['1', '2'] as never[] });
		expect(compileQuery.mock.results.at(-1)?.value).not.toBe(initialCompiled);
		expect(compileQuery).toHaveBeenCalledTimes(2);
		compileQuery.mockRestore();
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
			({ state }) => useCollectionQueryHandle('products', state),
			{ wrapper: Provider, initialProps: { state: base } }
		);

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['tea'])
		);

		rerender({
			state: {
				...base,
				search: 'coffee',
				filters: { ...base.filters, tags: [] },
			},
		});
		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['coffee'])
		);
	});

	it('finds the published products carrying a term, catalogue-hidden included, never a draft', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'live', id: 1, status: 'publish', categories: [{ id: 7 }] }),
			engineProduct({
				uuid: 'pos-only',
				id: 2,
				status: 'publish',
				catalog_visibility: 'hidden',
				categories: [{ id: 7 }],
			}),
			engineProduct({ uuid: 'draft', id: 3, status: 'draft', categories: [{ id: 7 }] }),
		]);
		const { result } = renderHook(() => useProductsCarryingTermsHandle('categories', [7]), {
			wrapper: Provider,
		});

		await waitFor(() => expect(answeredIds(result.current)).toEqual(['live', 'pos-only']));
		expect(engine.requireCalls).toEqual([]);
	});

	it('compiles the existence read taxonomy filter inside the selling baseline', () => {
		const compileQuery = jest.spyOn(queryStateTranslator, 'compileQuery');
		const { rerender } = renderHook(
			({ showOutOfStock }) => useProductsCarryingTermsHandle('tags', [9, 5], { showOutOfStock }),
			{ wrapper: Provider, initialProps: { showOutOfStock: false } }
		);
		const prefilter = () =>
			(
				compileQuery.mock.results.at(-1)?.value as ReturnType<
					typeof queryStateTranslator.compileQuery
				>
			).read.prefilter;

		// Tags, categories and brands are all promoted membership columns (tagIds since scope
		// generation 6, #2404): numeric membership, never a payload scan.
		const tags = { tagIds: { $in: [5, 9] } };
		expect(prefilter()).toEqual({
			$and: [tags, { 'payload.status': 'publish' }, { stockStatus: 'instock' }],
		});

		rerender({ showOutOfStock: true });
		expect(prefilter()).toEqual({
			$and: [tags, { 'payload.status': 'publish' }],
		});
		compileQuery.mockRestore();
	});

	it('lifts a term only for a published product the stage would show (in stock unless shown)', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'stocked', id: 1, status: 'publish', tags: [{ id: 5 }] }),
			engineProduct({
				uuid: 'sold-out',
				id: 2,
				status: 'publish',
				stock_status: 'outofstock',
				tags: [{ id: 6 }],
			}),
			engineProduct({ uuid: 'draft', id: 3, status: 'draft', tags: [{ id: 7 }] }),
		]);
		const { result, rerender } = renderHook(
			({ showOutOfStock }) => useProductsCarryingTermsHandle('tags', [5, 6, 7], { showOutOfStock }),
			{ wrapper: Provider, initialProps: { showOutOfStock: false } }
		);

		await waitFor(() => expect(answeredIds(result.current)).toEqual(['stocked']));
		rerender({ showOutOfStock: true });
		await waitFor(() => expect(answeredIds(result.current)).toEqual(['sold-out', 'stocked']));
	});

	it('answers the existence read once, and re-checks a product write only after the window', async () => {
		jest.useFakeTimers();
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'first', id: 1, status: 'publish', tags: [{ id: 5 }] })
		);
		const answers: string[][] = [];
		const { result, rerender } = renderHook(
			({ ids }) => useProductsCarryingTermsHandle('tags', ids),
			{ wrapper: Provider, initialProps: { ids: [5] } }
		);
		const subscription = queryHandleAnswers$(result.current).subscribe((answer) =>
			answers.push(answer.hits.map((hit) => hit.id).sort())
		);
		await act(async () => jest.advanceTimersByTimeAsync(0));
		expect(answers.at(-1)).toEqual(['first']);
		const settled = answers.length;

		// A sale-like write inside the window: no re-read, so no new answer.
		await act(async () => {
			await engineDB.collections.products.insert(
				engineProduct({ uuid: 'second', id: 2, status: 'publish', tags: [{ id: 5 }] })
			);
		});
		await act(async () => jest.advanceTimersByTimeAsync(EXISTENCE_RECHECK_MS - 1_000));
		expect(answers).toHaveLength(settled);

		// The window closes: one re-check, which sees the write.
		await act(async () => jest.advanceTimersByTimeAsync(1_000));
		expect(answers).toHaveLength(settled + 1);
		expect(answers.at(-1)).toEqual(['first', 'second']);

		// Quiet: nothing written, nothing re-read (not a poll).
		await act(async () => jest.advanceTimersByTimeAsync(EXISTENCE_RECHECK_MS * 3));
		expect(answers).toHaveLength(settled + 1);
		subscription.unsubscribe();

		// A changed id set is a new read, answered at once — not at the window's end.
		rerender({ ids: [5, 6] });
		const next: string[][] = [];
		const nextSubscription = queryHandleAnswers$(result.current).subscribe((answer) =>
			next.push(answer.hits.map((hit) => hit.id).sort())
		);
		await act(async () => jest.advanceTimersByTimeAsync(0));
		expect(next.at(-1)).toEqual(['first', 'second']);
		nextSubscription.unsubscribe();
	});

	const residentCategory = (id: number, name: string) => ({
		uuid: `category-${id}`,
		remoteId: String(id),
		remoteKey: String(id),
		payload: { id, name },
		sync: { revision: '1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	});

	/**
	 * A residents-only terms hook as the settings dialog reads it: every render's answer (the
	 * hits' count, or undefined while unanswered or withheld) and the handle it held.
	 */
	function residentsOnlyTerms() {
		const answers: (number | undefined)[] = [];
		const handles: QueryHandle[] = [];
		const useTerms = () => {
			const terms = useAllTermsHandle('products/categories', true, { residentsOnly: true });
			const { ready, hits } = terms.handle.value;
			answers.push(ready && !terms.withheld ? hits.length : undefined);
			if (handles.at(-1) !== terms.handle) handles.push(terms.handle);
			return terms;
		};
		/** The answers given since `from` (undefined is no answer). */
		const answered = (from = 0) =>
			answers.slice(from).filter((answer): answer is number => answer !== undefined);
		return { answers, handles, useTerms, answered };
	}

	/** Holds every refresh declaration in flight until `settle()`. */
	function holdRefreshes(target: FakeEngine) {
		const held = { settle: undefined as (() => void) | undefined };
		const require = target.require;
		target.require = (requirement) => {
			const handle = require(requirement);
			if (requirement.kind !== 'refresh') return handle;
			const ready = new Promise<Awaited<RequirementHandle['ready']>>((resolve) => {
				held.settle = () => void handle.ready.then(resolve);
			});
			return { ...handle, ready };
		};
		return held;
	}

	it('reads resident terms without declaring a refresh when asked for residents only', async () => {
		await engineDB.collections.categories.insert(residentCategory(1, 'Coffee'));
		const acquire = jest.spyOn(queryHandles, 'acquireEngineQueryHandle');
		const terms = residentsOnlyTerms();
		renderHook(terms.useTerms, { wrapper: Provider });
		await waitFor(() => expect(terms.answered().at(-1)).toBe(1));
		expect(engine.requireCalls).toEqual([]);
		// ONE read while the dialog is open: the residents read is the empty watch too.
		expect(new Set(acquire.mock.calls.map(([, key]) => key)).size).toBe(1);
		expect(terms.handles).toHaveLength(1);
		acquire.mockRestore();

		// The stage's read still fetches.
		renderHook(() => useAllTermsHandle('products/categories'), { wrapper: Provider });
		await waitFor(() => expect(engine.requireCalls).toHaveLength(1));
	});

	it('pulls an empty collection once for a residents-only read, unanswered until the pull settles', async () => {
		const held = holdRefreshes(engine);
		const terms = residentsOnlyTerms();
		const { result } = renderHook(terms.useTerms, { wrapper: Provider });

		// A fresh till: no residents is not an answer while the one refresh is in flight.
		await waitFor(() =>
			expect(engine.requireCalls).toEqual([
				expect.objectContaining({ kind: 'refresh', collection: 'categories' }),
			])
		);
		await act(async () => Promise.resolve());
		expect(terms.answered()).toEqual([]);

		// Settled and still empty: the collection's own answer — no terms (dimmed).
		await act(async () => held.settle?.());
		await waitFor(() => expect(terms.answered().at(-1)).toBe(0));
		// One pull, then residents-only again: nothing re-declared…
		expect(engine.requireCalls).toHaveLength(1);
		// …and the read after the pull is the read before it: one handle (no demand) either side
		// of the pulling one, so the answer is there the moment the pull settles.
		expect(terms.handles).toHaveLength(3);
		expect(terms.handles[1]).not.toBe(terms.handles[0]);
		expect(terms.handles[2]).toBe(terms.handles[0]);
		expect(result.current.handle).toBe(terms.handles[0]);
	});

	it('answers the pulled terms the moment the pull settles: the resident read is held through it', async () => {
		const held = holdRefreshes(engine);
		const terms = residentsOnlyTerms();
		const { result } = renderHook(terms.useTerms, { wrapper: Provider });
		await waitFor(() => expect(engine.requireCalls).toHaveLength(1));
		const resting = terms.handles[0];

		// The pull lands a term, then settles.
		await act(async () => {
			await engineDB.collections.categories.insert(residentCategory(1, 'Coffee'));
		});
		await waitFor(() => expect(terms.answered().at(-1)).toBe(1));
		const from = terms.answers.length;
		await act(async () => held.settle?.());
		await waitFor(() => expect(result.current.handle).toBe(resting));
		// Back on the resident read, which kept reading while the pull ran: never its stale
		// empty answer from before the pull.
		expect(terms.answered(from)).not.toContain(0);
		expect(terms.answered(from).at(-1)).toBe(1);
	});

	it('pulls the new store’s empty collection again when the engine changes under a residents-only read', async () => {
		let active: FakeEngine = engine;
		function Swappable({ children }: { children: React.ReactNode }) {
			return <Provider value={active}>{children}</Provider>;
		}
		const terms = residentsOnlyTerms();
		const { rerender } = renderHook(terms.useTerms, { wrapper: Swappable });
		// The first store's one-shot: pulled, settled, answered empty.
		await waitFor(() => expect(engine.requireCalls).toHaveLength(1));
		await waitFor(() => expect(terms.answered().at(-1)).toBe(0));

		// A store switch: a new engine, its collection empty too — pulled once again.
		const next = createFakeEngine(engineDB);
		active = next;
		rerender();
		await waitFor(() =>
			expect(next.requireCalls).toEqual([
				expect.objectContaining({ kind: 'refresh', collection: 'categories' }),
			])
		);
		expect(engine.requireCalls).toHaveLength(1);
	});

	it('pulls the new scope’s empty collection again when a same-site switch keeps the engine', async () => {
		const terms = residentsOnlyTerms();
		renderHook(terms.useTerms, { wrapper: Provider });
		// The first scope's one-shot: pulled, settled, answered empty.
		await waitFor(() => expect(engine.requireCalls).toHaveLength(1));
		await waitFor(() => expect(terms.answered().at(-1)).toBe(0));

		// A store or cashier switch on the same site: `scope.switch()` keeps the engine and bumps
		// every collection's coverage generation. The new scope's collection is empty too.
		const from = terms.answers.length;
		act(() => engine.setCollectionStatus('categories', { coverageGeneration: 1 }));
		await waitFor(() => expect(engine.requireCalls).toHaveLength(2));
		expect(engine.requireCalls.at(-1)).toEqual(
			expect.objectContaining({ kind: 'refresh', collection: 'categories' })
		);
		// …and once only: settled, the empty answer is the new scope's own, and nothing more is
		// declared.
		await waitFor(() => expect(terms.answered(from).at(-1)).toBe(0));
		expect(engine.requireCalls).toHaveLength(2);
	});

	it('answers nothing for a same-site switch into an empty scope while its pull runs, never the old scope’s terms', async () => {
		// The same engine over two scopes' databases, switched as the engine does: the database
		// first (`db$`), the coverage generation a microtask later — before the new database's
		// read has answered.
		const scopeB = await createEngineDatabase(['categories']);
		let activeDatabase: RxDatabase = engineDB;
		const databaseListeners = new Set<(database: RxDatabase | null) => void>();
		const active = engine.active;
		engine.active = () => ({ ...active()!, database: activeDatabase }) as never;
		engine.db$ = ((listener: (database: RxDatabase | null) => void) => {
			databaseListeners.add(listener);
			return () => databaseListeners.delete(listener);
		}) as never;
		try {
			await engineDB.collections.categories.insert(residentCategory(1, 'Coffee'));
			const terms = residentsOnlyTerms();
			const { result } = renderHook(terms.useTerms, { wrapper: Provider });
			await waitFor(() => expect(terms.answered().at(-1)).toBe(1));
			expect(engine.requireCalls).toEqual([]);

			// Scope B holds no terms; its pull is held in flight.
			const held = holdRefreshes(engine);
			const scopeA = result.current.handle;
			const from = terms.answers.length;
			act(() => {
				activeDatabase = scopeB;
				databaseListeners.forEach((listener) => listener(scopeB));
				engine.setCollectionStatus('categories', { coverageGeneration: 1 });
			});
			// A new handle for the new scope: its snapshot starts unanswered…
			expect(result.current.handle).not.toBe(scopeA);
			await waitFor(() =>
				expect(engine.requireCalls).toEqual([
					expect.objectContaining({ kind: 'refresh', collection: 'categories' }),
				])
			);
			// …and stays so while the pull runs: never scope A's one term.
			await act(async () => Promise.resolve());
			expect(terms.answered(from)).toEqual([]);

			await act(async () => held.settle?.());
			await waitFor(() => expect(terms.answered(from).at(-1)).toBe(0));
		} finally {
			if (!scopeB.destroyed) await scopeB.remove();
		}
	});

	it('moves the scope key on a same-site switch and on a new engine, and holds it otherwise', () => {
		let active: FakeEngine = engine;
		function Swappable({ children }: { children: React.ReactNode }) {
			return <Provider value={active}>{children}</Provider>;
		}
		const { result, rerender } = renderHook(() => useScopeKey('products'), {
			wrapper: Swappable,
		});
		const first = result.current;
		rerender();
		expect(result.current).toBe(first);

		// A same-site store or cashier switch: the same engine, the products' generation bumped.
		act(() => engine.setCollectionStatus('products', { coverageGeneration: 1 }));
		const switched = result.current;
		expect(switched).not.toBe(first);

		// A cross-site change: a new engine, whose generation starts at 0 again.
		active = createFakeEngine(engineDB);
		rerender();
		expect(result.current).not.toBe(switched);
		expect(result.current).not.toBe(first);
	});

	it('compiles the tag existence read to promoted tag membership, never a payload scan', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'tagged', id: 1, status: 'publish', tags: [{ id: 5 }] }),
			engineProduct({ uuid: 'untagged', id: 2, status: 'publish', tags: [{ id: 6 }] }),
		]);
		const compileQuery = jest.spyOn(queryStateTranslator, 'compileQuery');
		const { result } = renderHook(() => useProductsCarryingTermsHandle('tags', [9, 5]), {
			wrapper: Provider,
		});

		const prefilter = (
			compileQuery.mock.results.at(-1)?.value as ReturnType<
				typeof queryStateTranslator.compileQuery
			>
		).read.prefilter;
		// Inside the selling baseline (the test above): in stock unless out-of-stock is shown.
		expect(prefilter).toEqual({
			$and: [
				{ tagIds: { $in: [5, 9] } },
				{ 'payload.status': 'publish' },
				{ stockStatus: 'instock' },
			],
		});
		expect(JSON.stringify(prefilter)).not.toContain('payload.tags');
		await waitFor(() => expect(answeredIds(result.current)).toEqual(['tagged']));
		compileQuery.mockRestore();
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
			() => useCollectionQueryHandle('products', state, { remoteIds: [] }),
			{
				wrapper: Provider,
			}
		);

		await waitFor(() => expect(current(result.current)?.hits).toEqual([]));
		expect(engine.requireCalls).toEqual([]);
	});

	it('re-declares the current query after a reset generation bump', async () => {
		const base: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [7], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};
		const { rerender } = renderHook(({ state }) => useCollectionQueryHandle('products', state), {
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

	it('answers a search from a document scan when the search index fails (#1733)', async () => {
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
			({ state }) => useCollectionQueryHandle('products', state),
			{ wrapper: Provider, initialProps: { state: base } }
		);
		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));

		// A broken index no longer errors the search — the scan lane answers it.
		const products = engineDB.collections.products;
		(products as unknown as { initSearch: () => Promise<never> }).initSearch = async () => {
			throw new Error('search index failed');
		};
		try {
			rerender({ state: { ...base, search: 'coffee' } });
			await waitFor(
				() => {
					const answer = read(result.current);
					expect(answer.hits.map((hit) => hit.id)).toEqual(['coffee']);
					expect(answer.searchState).toBe('answered');
				},
				{ timeout: 2000 }
			);
		} finally {
			// The stub must not outlive a failed assertion — the collection instance
			// is shared with later tests in this file.
		}
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
			({ state }) => useCollectionQueryHandle('products', state),
			{ wrapper: Provider, initialProps: { state: base } }
		);
		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));

		const products = engineDB.collections.products;
		const originalFind = products.find.bind(products);
		(products as unknown as { find: () => never }).find = () => {
			throw new Error('collection read failed');
		};
		try {
			rerender({ state: { ...base, filters: { ...base.filters, categories: [9] } } });
			await waitFor(() => expect(() => read(result.current)).toThrow('collection read failed'));
		} finally {
			// The stub must not outlive a failed assertion — the collection instance
			// is shared with later tests in this file.
			(products as unknown as { find: typeof originalFind }).find = originalFind;
		}
		rerender({ state: base });
		await waitFor(() => expect(read(result.current).hits.map((hit) => hit.id)).toEqual(['coffee']));
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
		const bindTargeted = useCollectionQueryHandle as unknown as (
			collection: 'variations',
			queryState: QueryStateOf<'variations'>,
			options: { remoteIds: import('@wcpos/sync-core').RemoteId[] }
		) => QueryHandle;
		const { result } = renderHook(
			() => bindTargeted('variations', state, { remoteIds: ['11', '12'] as never }),
			{
				wrapper: Provider,
			}
		);

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['red-small'])
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
		const { result } = renderHook(() => useCollectionQueryHandle('variations', state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['red-small', 'any-color'])
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
		const bindTargeted = useCollectionQueryHandle as unknown as (
			collection: 'variations',
			queryState: QueryStateOf<'variations'>,
			options: { remoteIds: import('@wcpos/sync-core').RemoteId[] }
		) => QueryHandle;
		const { result, rerender } = renderHook(
			({ state }) => bindTargeted('variations', state, { remoteIds: ['11', '12', '13'] as never }),
			{ wrapper: Provider, initialProps: { state: base } }
		);

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual([
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
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['red-large'])
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
		await waitFor(() => expect(current(result.current)?.hits).toEqual([]));
	});

	it("useCollectionQueryHandle('refunds', …) declares the requirement and serves exact-boundary local rows in the window", async () => {
		await engineDB.collections.refunds.bulkInsert(
			[
				['1', '2026-09-01T00:00:00'],
				['2', '2026-09-02T00:00:00'],
				['3', '2026-09-03T00:00:00'],
				['4', '2026-09-04T00:00:00'],
				['5', '2026-08-31T23:59:59'],
			].map(([id, date]) => ({
				uuid: `woo-refund:${id}`,
				remoteId: id,
				sessionId: '',
				payload: {
					id: Number(id),
					parent_id: 42,
					date_created_gmt: date,
					meta_data: [],
				},
				local: { dirty: false, pendingMutationIds: [] },
				sync: { revision: '', partial: false, source: 'woo-rest' },
			}))
		);
		const state: QueryStateOf<'refunds'> = {
			search: '',
			filters: {
				dateRange: { from: '2026-09-01T00:00:00', to: '2026-09-03T00:00:00' },
			},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: Number.MAX_SAFE_INTEGER,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('refunds', state), {
			wrapper: Provider,
		});
		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual([
				'woo-refund:3',
				'woo-refund:2',
				'woo-refund:1',
			])
		);
		expect(engine.requireCalls).toContainEqual(
			expect.objectContaining({
				kind: 'refunds-browse',
				collection: 'refunds',
				after: 1788220800,
				before: 1788393600,
				limit: 'all',
			})
		);
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

		renderHook(() => useCollectionQueryHandle('orders', state), {
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

	const salesState: QueryStateOf<'orders'> = {
		search: '',
		filters: { store: '12', dateRange: { from: '2026-07-01', to: '2026-07-14' } },
		sort: { field: 'date_created_gmt', direction: 'desc' },
		limit: Number.MAX_SAFE_INTEGER,
	};
	// Removing option forwarding or memo identity loses the online residents on this transition.
	it("a sales-scoped orders handle serves the store's POS orders and the site's online orders from a mixed resident set", async () => {
		await engineDB.collections.orders.bulkInsert([
			engineOrder({
				uuid: 'local',
				id: 1,
				created_via: 'woocommerce-pos',
				meta_data: [{ key: '_pos_store', value: '12' }],
				date_created_gmt: '2026-07-02',
			}),
			engineOrder({
				uuid: 'foreign',
				id: 2,
				created_via: 'woocommerce-pos',
				meta_data: [{ key: '_pos_store', value: '13' }],
				date_created_gmt: '2026-07-02',
			}),
			engineOrder({
				uuid: 'checkout',
				id: 3,
				created_via: 'checkout',
				date_created_gmt: '2026-07-02',
			}),
			engineOrder({ uuid: 'admin', id: 4, created_via: 'admin', date_created_gmt: '2026-07-02' }),
		]);
		const { result, rerender } = renderHook(
			({ storeScope }: { storeScope: 'pos' | 'sales' }) =>
				useCollectionQueryHandle('orders', salesState, { storeScope }),
			{ wrapper: Provider, initialProps: { storeScope: 'pos' } }
		);
		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['local'])
		);
		rerender({ storeScope: 'sales' });
		await waitFor(() =>
			expect(
				current(result.current)
					?.hits.map((hit) => hit.id)
					.sort()
			).toEqual(['admin', 'checkout', 'local'])
		);
	});

	it("a sales-scoped handle's demand key carries no store part and differs from the pos-scoped key", async () => {
		const { result, rerender } = renderHook(
			({ storeScope }: { storeScope: 'pos' | 'sales' }) =>
				useCollectionQueryHandle('orders', salesState, { storeScope }),
			{ wrapper: Provider, initialProps: { storeScope: 'pos' } }
		);
		await firstValueFrom(field$(result.current, 'total'));
		expect(engine.coverageSubscribeCalls).toContainEqual({
			collection: 'orders',
			queryKey:
				'orders:browser:status=all:store=12:after=1782864000:before=1783987200:search=:limit=all',
		});
		rerender({ storeScope: 'sales' });
		await firstValueFrom(field$(result.current, 'total'));
		expect(engine.coverageSubscribeCalls).toContainEqual({
			collection: 'orders',
			queryKey: 'orders:browser:status=all:after=1782864000:before=1783987200:search=:limit=all',
		});
		expect(engine.requireCalls.at(-1)).not.toHaveProperty('store');
	});

	// Dropping the target hides progress; borrowing either server count overstates the subset.
	it("a superset lane still reports laneProgress and a complete verdict yields the local count as total, never the lane's total", async () => {
		engine.setCensusTotal('orders', 203);
		await engineDB.collections.orders.insert(
			engineOrder({
				uuid: 'online',
				id: 1,
				created_via: 'checkout',
				date_created_gmt: '2026-07-02',
			})
		);
		const target = {
			collection: 'orders' as const,
			queryKey: 'orders:browser:status=all:after=1782864000:before=1783987200:search=:limit=all',
		};
		engine.setCoverageVerdict(target, {
			total: 99,
			source: 'lane',
			complete: false,
			fresh: true,
			progress: { downloaded: 4, total: 99 },
		});
		const { result } = renderHook(
			() => useCollectionQueryHandle('orders', salesState, { storeScope: 'sales' }),
			{ wrapper: Provider }
		);
		await waitFor(() => expect(current(result.current)?.count).toBe(1));
		const totals: (number | null)[] = [];
		const subscription = field$(result.current, 'total').subscribe((total) => totals.push(total));
		expect(await firstValueFrom(field$(result.current, 'laneProgress'))).toEqual({
			downloaded: 4,
			total: 99,
		});
		expect(totals.at(-1)).toBeNull();
		act(() =>
			engine.setCoverageVerdict(target, {
				total: 99,
				source: 'lane',
				complete: true,
				fresh: true,
				progress: null,
			})
		);
		await waitFor(() => expect(totals.at(-1)).toBe(1));
		expect(await firstValueFrom(field$(result.current, 'laneProgress'))).toBeNull();
		expect(totals).not.toContain(99);
		expect(totals).not.toContain(203);
		subscription.unsubscribe();
	});

	/**
	 * The lane rows themselves are the ENGINE's business — precedence, freshness and the
	 * ranged-walk cursor are settled behind `coverageChanges` and covered against real storage
	 * in packages/sync-engine. What these fixtures pin is the half that stayed here: which
	 * coverage TARGET a given query state resolves to, and how a verdict is composed with the
	 * resident count. So the fixture seeds the verdict for the exact key it expects the handle
	 * to ask about — seeding the wrong key is indistinguishable from asking the wrong question.
	 */
	async function expectCoverageTotal(queryKey: string, filters: QueryStateOf<'orders'>['filters']) {
		engine.setCoverageVerdict(
			{ collection: 'orders', queryKey },
			{ total: 2, source: 'lane', complete: true, fresh: true }
		);
		const { result } = renderHook(
			() =>
				useCollectionQueryHandle('orders', {
					search: '',
					filters,
					sort: { field: 'date_created_gmt', direction: 'desc' },
					limit: 25,
				}),
			{ wrapper: Provider }
		);

		// The seeded verdict's total (no residents exist), proving the handle asked about
		// exactly this coverage key.
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 2)))
		).resolves.toBe(2);
	}

	it('uses coverage for an order status and date-range selector', async () => {
		await expectCoverageTotal(
			'orders:browser:status=processing:after=1782864000:before=1783987200:orderby=date:order=desc:search=:limit=25',
			{
				status: 'processing',
				dateRange: { from: '2026-07-01', to: '2026-07-14' },
			}
		);
	});

	it('uses coverage for an order status and customer selector', async () => {
		await expectCoverageTotal(
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
				useCollectionQueryHandle('orders', {
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
			firstValueFrom(
				field$(result.current, 'laneProgress').pipe(filter((progress) => progress !== null))
			)
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
				useCollectionQueryHandle('orders', {
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

		await expect(firstValueFrom(field$(result.current, 'laneProgress'))).resolves.toBeNull();
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
				useCollectionQueryHandle('orders', {
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

		const totals: (number | null)[] = [];
		const subscription = field$(result.current, 'total').subscribe((total) => totals.push(total));
		await new Promise((resolve) => setTimeout(resolve, 50));
		subscription.unsubscribe();
		expect(totals.length).toBeGreaterThan(0);
		// The seeded unranged lane's total (2) must never surface for the ranged grid.
		expect(totals).not.toContain(2);
		// Not merely "the answer stayed local": the handle never ASKED, which is the gate working.
		expect(engine.coverageSubscribeCalls).toEqual([]);
	});

	it('uses coverage for a reports-shaped order selector (cashier, store and range)', async () => {
		await expectCoverageTotal(
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
		// The screen shape: the owner above the boundary, the reader drawing the handle below it.
		function OrdersTable({ handle }: { handle: QueryHandle }) {
			const { result } = useQuerySnapshot(useDrawnHandle(handle));
			return <div data-testid="rows">{result.hits.length}</div>;
		}
		function OrdersScreen({ currentState }: { currentState: QueryStateOf<'orders'> }) {
			const handle = useCollectionQueryHandle('orders', currentState);
			return (
				<React.Suspense fallback={<div data-testid="skeleton" />}>
					<OrdersTable handle={handle} />
				</React.Suspense>
			);
		}
		function Screen({ currentState }: { currentState: QueryStateOf<'orders'> }) {
			return (
				<Provider>
					<OrdersScreen currentState={currentState} />
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

	it('exposes the coverage-aware total rather than the loaded window', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'resident', id: 1, name: 'Resident' })
		);
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 1,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('products', state), {
			wrapper: Provider,
		});
		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));
		// Nothing vouches for a size yet — one resident under a limit of 1 is "what has
		// loaded", not "how many there are", so the handle declines to name a total rather
		// than publishing the loaded-row count as one.
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === null)))
		).resolves.toBeNull();

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
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 3)))
		).resolves.toBe(3);
		await expect(firstValueFrom(field$(result.current, 'active'))).resolves.toBe(false);
		await act(async () => result.current.sync());
		expect(engine.syncCalls).toContain('scheduler-drain');
	});

	// A recorded total below the resident count is proven outdated — the projection publishes
	// the resident count instead: more residents than the server's last count proves that
	// count stale, so the larger number wins.
	it('publishes the resident count when residents exceed the recorded total', async () => {
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
		const { result } = renderHook(() => useCollectionQueryHandle('products', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(2));
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 2)))
		).resolves.toBe(2);

		// The moment the recorded total catches back up, the server's number returns.
		engine.setCoverageVerdict(
			{
				collection: 'products',
				queryKey: 'products:browse-window:limit=100:orderby=title:order=asc',
			},
			{ total: 5, source: 'query-total', complete: false, fresh: false }
		);
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 5)))
		).resolves.toBe(5);
	});

	// One source of truth with the Store Health › Database page: until the engine records a
	// per-query answer for a plain whole-collection browse, the collection CENSUS — the very
	// number the Database page shows — stands in as the total, instead of the resident count
	// posing as one.
	it('falls back to the census total for a plain browse with no recorded per-query total', async () => {
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'resident', id: 1, name: 'Resident' })
		);
		engine.setCensusTotal('products', 42);
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 25,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('products', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 42)))
		).resolves.toBe(42);
		expect(engine.censusSubscribeCount).toBeGreaterThan(0);
	});

	// One source of truth with the Store Health › Database page (owner ruling 2026-08-22).
	// The browse-window verdict and the census count DIFFERENT populations on purpose (#1400:
	// the walk counts `wcpos/v2`, the census probe counts `wc/v3`), so a whole-collection
	// browse that preferred the verdict printed a total the Database page contradicted.
	it('prefers the census total over the per-query verdict for a whole-collection browse', async () => {
		engine.setCensusTotal('products', 42);
		engine.setCoverageVerdict(
			{
				collection: 'products',
				queryKey: 'products:browse-window:limit=100:orderby=title:order=asc',
			},
			{ total: 3, source: 'query-total', complete: false, fresh: true }
		);
		const state: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 25,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('products', state), {
			wrapper: Provider,
		});

		const totals: (number | null)[] = [];
		const subscription = field$(result.current, 'total').subscribe((total) => totals.push(total));
		await waitFor(() => expect(totals).toContain(42));
		subscription.unsubscribe();
		// The Database page's number wins outright — the browse walk's own tally may not
		// override it.
		expect(totals).not.toContain(3);
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
		const { result } = renderHook(() => useCollectionQueryHandle('products', posShaped), {
			wrapper: Provider,
		});
		await waitFor(() => expect(current(result.current)).toBeTruthy());
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 5)))
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
		const { result } = renderHook(() => useCollectionQueryHandle('products', partly), {
			wrapper: Provider,
		});
		await waitFor(() => expect(current(result.current)).toBeTruthy());
		const totals: (number | null)[] = [];
		const subscription = field$(result.current, 'total').subscribe((total) => totals.push(total));
		await new Promise((resolve) => setTimeout(resolve, 20));
		subscription.unsubscribe();
		// The superset lane's total (4) must never surface for the narrower grid.
		expect(totals).not.toContain(4);
		// The superset lane exists and is fresh; the handle simply never asks about it.
		expect(engine.coverageSubscribeCalls).toEqual([]);
	});

	it('uses coupons:all coverage only for the unfiltered reference lane', async () => {
		await engineDB.collections.coupons.insert({
			uuid: 'coupon-1',
			remoteId: '1',
			remoteKey: '1',
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
		const { result, rerender } = renderHook(
			({ state }) => useCollectionQueryHandle('coupons', state),
			{
				wrapper: Provider,
				initialProps: { state: base },
			}
		);

		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 3)))
		).resolves.toBe(3);

		// Filtered, the reference lane's total no longer applies, and no census was recorded —
		// so there is no size to report. The footer states its count without a denominator
		// rather than passing the single loaded row off as "1 of 1".
		rerender({ state: { ...base, filters: { status: 'publish' } } });
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === null)))
		).resolves.toBeNull();
	});

	// Tier 0. Tax rates are seeded by the engine's BOOT lane, so compiled query demand declares
	// nothing for them and there is no handle to carry a key. The handle must therefore ask
	// through the reference arm and let the engine resolve `taxRates:all` itself — seeding the
	// verdict under `{lane:'reference'}` is what proves it never spells the key out.
	it('projects taxRates:all coverage and idle activity for Tier 0', async () => {
		await engineDB.collections.taxRates.insert({
			uuid: 'woo-tax-rate:1',
			remoteId: '1',
			remoteKey: '1',
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
		const { result } = renderHook(() => useCollectionQueryHandle('tax-rates', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 2)))
		).resolves.toBe(2);

		await expect(firstValueFrom(field$(result.current, 'active'))).resolves.toBe(false);
	});

	it('keeps customer search cold until engine results land locally, naming no total', async () => {
		// A search lane exists and is complete, but a search is not a browse: the engine hands
		// out no queryKey for it, so the handle has no coverage target. With no census either,
		// nobody can say how many customers match — so it names no total at all rather than
		// dressing the loaded-row count up as one. The lane is seeded to prove it is IGNORED.
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
		const { result } = renderHook(() => useCollectionQueryHandle('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits).toEqual([]));
		expect(engine.searchRequireCalls).toHaveLength(1);
		expect(engine.searchRequireCalls[0]?.requirement).toMatchObject({
			collection: 'customers',
			kind: 'search',
			term: 'ada',
			limit: 10,
		});
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === null)))
		).resolves.toBeNull();

		await engineDB.collections.customers.insert({
			uuid: 'customer-ada',
			remoteId: '103',
			remoteKey: '103',
			payload: { id: 103, first_name: 'Ada', last_name: 'Lovelace' },
			sync: { revision: '1', partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		});

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['customer-ada'])
		);
		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === null)))
		).resolves.toBeNull();
		expect(engine.searchRequireCalls).toHaveLength(1);
		// The handle's one snapshot reads the search lane's EXHAUSTION verdict eagerly (the paging
		// guard's signal; it was a lazy stream before). That is the only coverage it asks for: the
		// total path has no target for a search, so the lane's total 9 never reaches `total$`.
		expect(engine.coverageSubscribeCalls).toEqual([
			{ collection: 'customers', queryKey: 'customers:search=ada:limit=10' },
		]);
	});

	it('reports the parent search lane exhaustion verdict and no opinion for browse', async () => {
		const target = { collection: 'products' as const, queryKey: 'products:search:sprite' };
		engine.setCoverageVerdict(target, { complete: true, fresh: true, source: 'lane', total: 4 });
		// The fake serves local by default; an incomplete lane only means "more may exist"
		// after a wire walk actually wrote it, so settle the search as `fetched`.
		const originalRequire = engine.require.bind(engine);
		engine.require = (requirement) => {
			const handle = originalRequire(requirement);
			if (requirement.kind !== 'search') return handle;
			return {
				...handle,
				ready: Promise.resolve({
					action: 'fetched' as const,
					missingRecordIds: [],
					reason: 'test walked',
				}),
			};
		};
		const search: QueryStateOf<'products'> = {
			search: 'sprite',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};
		const { result, rerender } = renderHook(({ state }) => useProductsQueryHandle(state), {
			wrapper: Provider,
			initialProps: { state: search },
		});

		await expect(
			firstValueFrom(field$(result.current, 'exhausted').pipe(filter((value) => value === true)))
		).resolves.toBe(true);

		const incomplete = firstValueFrom(
			field$(result.current, 'exhausted').pipe(filter((value) => value === false))
		);
		act(() =>
			engine.setCoverageVerdict(target, { complete: false, fresh: true, source: 'lane', total: 10 })
		);
		await expect(incomplete).resolves.toBe(false);

		rerender({ state: { ...search, search: '' } });
		await expect(
			firstValueFrom(field$(result.current, 'exhausted').pipe(filter((value) => value === null)))
		).resolves.toBeNull();
		engine.require = originalRequire;
	});

	// A walk that never landed leaves no lane. Reading "no lane" as "more may exist" would let
	// the grid grow its limit on every end-reached fire while the store is unreachable — the
	// #1221 storm by another door — so the engine must decline to have an opinion instead.
	it('has no exhaustion opinion when nothing walked: served local, or the walk failed', async () => {
		const target = { collection: 'products' as const, queryKey: 'products:search:sprite' };
		const search: QueryStateOf<'products'> = {
			search: 'sprite',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};

		// Served local (the fake's default outcome) over an INCOMPLETE lane — a fully resident
		// catalogue looks exactly like this, and its local rows are the whole answer: null.
		engine.setCoverageVerdict(target, { complete: false, fresh: true, source: 'lane', total: 10 });
		const first = renderHook(() => useProductsQueryHandle(search), { wrapper: Provider });
		const firstSeen: (boolean | null)[] = [];
		const firstSubscription = field$(first.result.current, 'exhausted').subscribe((value) =>
			firstSeen.push(value)
		);
		await waitFor(() =>
			expect(firstValueFrom(field$(first.result.current, 'pending'))).resolves.toBe(false)
		);
		expect(firstSeen).not.toContain(false);
		expect(firstSeen.at(-1)).toBeNull();
		firstSubscription.unsubscribe();
		first.unmount();

		// The walk failed: even a lane that LOOKS incomplete must not read as "more may exist".
		engine.setCoverageVerdict(target, { complete: false, fresh: true, source: 'lane', total: 10 });
		const originalRequire = engine.require.bind(engine);
		engine.require = (requirement) => {
			const handle = originalRequire(requirement);
			if (requirement.kind !== 'search') return handle;
			return {
				...handle,
				ready: Promise.reject(new Error('Woo REST products search request failed: 503')),
			};
		};
		const second = renderHook(() => useProductsQueryHandle(search), { wrapper: Provider });
		const seen: (boolean | null)[] = [];
		const subscription = field$(second.result.current, 'exhausted').subscribe((value) =>
			seen.push(value)
		);
		await waitFor(() =>
			expect(firstValueFrom(field$(second.result.current, 'pending'))).resolves.toBe(false)
		);
		expect(seen).not.toContain(false);
		expect(seen.at(-1)).toBeNull();
		subscription.unsubscribe();
		engine.require = originalRequire;
	});

	it('reports pending between standing demand declaration and settlement', async () => {
		const originalRequire = engine.require.bind(engine);
		let settleSearch!: (outcome: Awaited<RequirementHandle['ready']>) => void;
		engine.require = (requirement) => {
			const handle = originalRequire(requirement);
			if (requirement.kind !== 'search') return handle;
			return {
				...handle,
				ready: new Promise((resolve) => {
					settleSearch = resolve;
				}),
			};
		};
		const state: QueryStateOf<'customers'> = {
			search: 'ada',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('customers', state), {
			wrapper: Provider,
		});
		const pending: boolean[] = [];
		const subscription = field$(result.current, 'pending').subscribe((value) =>
			pending.push(value)
		);
		await waitFor(() => expect(pending.at(-1)).toBe(true));

		act(() =>
			settleSearch({ action: 'serve-local', missingRecordIds: [], reason: 'test settled' })
		);
		await waitFor(() => expect(pending.at(-1)).toBe(false));
		subscription.unsubscribe();
	});

	// Owner ruling 2026-08-22: the denominator is a property of the STORE, not of the current
	// view, so it holds still while the cashier types. "Showing 1 of 203" says this till knows
	// 203 products and one matches; the old "Showing 1 of 1" made the denominator move with
	// every keystroke, and "Showing 0 of 0" on a failed search read like an empty till.
	it('keeps the census as the total while a search narrows the rendered rows', async () => {
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'match', id: 1, name: 'Blue Shirt' }),
			engineProduct({ uuid: 'other', id: 2, name: 'Red Hat' }),
		]);
		engine.setCensusTotal('products', 203);
		const searched: QueryStateOf<'products'> = {
			search: 'blue',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 25,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('products', searched), {
			wrapper: Provider,
		});

		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 203)))
		).resolves.toBe(203);
		expect(engine.censusSubscribeCount).toBeGreaterThan(0);
	});

	// The "Showing 20 of 20" defect, pinned. A windowed browse lane is deliberately INCOMPLETE
	// (coverage-verdicts.ts), the orders fetcher records no query total, and orders is
	// scope-narrowed so no census stands in — leaving the loaded-row count as the only number
	// in the room. Publishing THAT as the total made a page of 20 read "Showing 20 of 20",
	// which tells a cashier those are all their orders right up until the next scroll finds
	// more. There is no honest denominator here, so the handle names none.
	it('names no total for a windowed browse the engine cannot size', async () => {
		await engineDB.collections.orders.bulkInsert(
			Array.from({ length: 3 }, (_, index) =>
				engineOrder({
					uuid: `windowed-order-${index}`,
					id: index + 1,
					date_created_gmt: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00`,
				})
			)
		);
		// Exactly what a windowed browse reports: it holds a window, it does not claim the set.
		engine.setCoverageVerdict(
			{
				collection: 'orders',
				queryKey: 'orders:browser:status=all:orderby=date:order=desc:search=:limit=3',
			},
			{ total: null, source: 'unknown', complete: false, fresh: true }
		);
		const windowed: QueryStateOf<'orders'> = {
			search: '',
			filters: {},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 3,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('orders', windowed), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)).toBeTruthy());
		const totals: (number | null)[] = [];
		const subscription = field$(result.current, 'total').subscribe((total) => totals.push(total));
		await new Promise((resolve) => setTimeout(resolve, 20));
		subscription.unsubscribe();
		// The page size must never surface as the size of the set.
		expect(totals).not.toContain(3);
		expect(totals).toContain(null);
	});

	// The other side of it: once the engine DOES claim local completeness, the resident count
	// is a truthful total — the reports date-range walk runs to completion, and "12 of 12"
	// there is a fact, not a page boundary.
	it('reports the resident count as the total once the lane claims completeness', async () => {
		await engineDB.collections.orders.bulkInsert(
			Array.from({ length: 2 }, (_, index) =>
				engineOrder({
					uuid: `complete-order-${index}`,
					id: index + 10,
					date_created_gmt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00`,
				})
			)
		);
		engine.setCoverageVerdict(
			{
				collection: 'orders',
				queryKey: 'orders:browser:status=all:orderby=date:order=desc:search=:limit=100',
			},
			{ total: null, source: 'unknown', complete: true, fresh: true }
		);
		const complete: QueryStateOf<'orders'> = {
			search: '',
			filters: {},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 100,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('orders', complete), {
			wrapper: Provider,
		});

		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 2)))
		).resolves.toBe(2);
	});

	// The orders grid's cashier and store pills are pre-set FILTERS, not a fixed scope — both
	// are removable and re-selectable, so the page can be widened to the whole store. Treating
	// them as scope is what cut this grid off from the census and left "Showing 20 of 20".
	it('reports the census for the orders grid even with the cashier and store pills set', async () => {
		engine.setCensusTotal('orders', 4_312);
		const scoped: QueryStateOf<'orders'> = {
			search: '',
			filters: { cashier: '7', store: '24128' },
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 25,
		};
		const { result } = renderHook(() => useCollectionQueryHandle('orders', scoped), {
			wrapper: Provider,
		});

		await expect(
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 4_312)))
		).resolves.toBe(4_312);
		expect(engine.censusSubscribeCount).toBeGreaterThan(0);
	});

	// #951. A sorted customers grid declares a browse window, and its footer must report the
	// SERVER's count for that view — a windowed browse is deliberately incomplete, so reading
	// the resident count as the total is the false-complete bug (#894/#945).
	it('reports the server total for a sorted customers browse, not the resident count', async () => {
		await engineDB.collections.customers.insert({
			uuid: 'customer-ada',
			remoteId: '103',
			remoteKey: '103',
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
		const { result } = renderHook(() => useCollectionQueryHandle('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));
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
			firstValueFrom(field$(result.current, 'total').pipe(filter((total) => total === 4_200)))
		).resolves.toBe(4_200);
	});

	// #1028 follow-on: the plugin proxy (#1488/#1500) now handles last_name, so the grid's
	// DEFAULT sort drives a server-sorted browse window rather than a local-only sort.
	it('declares a browse window for the last_name sort now that the plugin proxies it', async () => {
		await engineDB.collections.customers.insert({
			uuid: 'customer-ada',
			remoteId: '103',
			remoteKey: '103',
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
		const { result } = renderHook(() => useCollectionQueryHandle('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));
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
			remoteKey: '103',
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
		const { result } = renderHook(() => useCollectionQueryHandle('customers', state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits).toHaveLength(1));
		expect(engine.requireCalls).toContainEqual(
			expect.objectContaining({ kind: 'customer-browse', orderby: 'role', order: 'desc' })
		);
	});

	it('releases direct search demand when its owner unmounts', async () => {
		const state: QueryStateOf<'customers'> = {
			search: 'ada',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};
		const { unmount } = renderHook(() => useCollectionQueryHandle('customers', state), {
			wrapper: Provider,
		});
		await waitFor(() => expect(engine.searchRequireCalls).toHaveLength(1));
		expect(engine.searchRequireCalls[0]?.released).toBe(false);

		unmount();
		// The handle releases one microtask after its last reader leaves (DECLARE BEFORE RELEASE:
		// a successor subscribing in the same commit keeps the engine entry alive).
		await act(async () => undefined);

		expect(engine.searchRequireCalls[0]?.released).toBe(true);
	});

	it('declares the successor before releasing the search a generation bump supersedes', async () => {
		// The demand effect lists coverageGeneration in its deps and its cleanup
		// releases the handles. React runs cleanup BEFORE the next setup, so the
		// engine saw a zero-subscriber window on every re-run — and release()
		// ABORTS an in-flight fetch by design (require-search: "release()
		// abandons an in-flight search"). A generation bump is a re-declaration
		// signal, not a reason to kill a search that is still running.
		//
		// The invariant is about ORDER, not state: the predecessor IS released
		// either way, so a `released` flag cannot express this. What matters is
		// that its successor exists first — an identical re-declaration then
		// rejoins the same engine entry and the subscriber count never hits zero.
		// Cashier impact: search returned nothing while the catalogue was still
		// backfilling (monorepo#1614).
		const state: QueryStateOf<'customers'> = {
			search: 'ada',
			filters: {},
			sort: { field: 'last_name', direction: 'asc' },
			limit: 10,
		};
		renderHook(() => useCollectionQueryHandle('customers', state), { wrapper: Provider });
		await waitFor(() => expect(engine.searchRequireCalls).toHaveLength(1));

		// Same query, same term — only the generation moved.
		act(() => engine.setCollectionStatus('customers', { coverageGeneration: 1 }));
		await waitFor(() => expect(engine.searchRequireCalls.length).toBeGreaterThan(1));

		const search = engine.demandEvents.filter((event) => event.endsWith(':search'));
		// require, require, release — NOT require, release, require.
		expect(search.slice(0, 3)).toEqual(['require:search', 'require:search', 'release:search']);
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

		renderHook(() => useCollectionQueryHandle('customers', state), {
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
		const { result } = renderHook(() => useCollectionQueryHandle('customers', state), {
			wrapper: Provider,
		});
		const subscription = field$(result.current, 'active').subscribe((active) =>
			activeValues.push(active)
		);

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
		const { result, rerender } = renderHook(
			({ currentState }) => useLogsQueryHandle(currentState),
			{ wrapper: Provider, initialProps: { currentState: state } }
		);
		await waitFor(() => expect(result.current.value.ready).toBe(true));
		// The loaded window is one row; the count — the footer's total — is every match.
		expect(result.current.value.hits).toHaveLength(1);
		await waitFor(() => expect(result.current.value.count).toBe(2));
		// A local read: nothing pending, no exhaustion opinion, never active, nothing to sync.
		expect(result.current.value.pending).toBe(false);
		expect(result.current.value.exhausted).toBeNull();
		expect(result.current.value.active).toBe(false);
		const syncCalls = [...engine.syncCalls];
		await act(async () => result.current.sync());
		expect(engine.syncCalls).toEqual(syncCalls);
		expect(engine.requireCalls).toEqual([]);

		rerender({ currentState: { ...state, search: 'three', filters: {} } });
		await waitFor(() => expect(result.current.value.ready).toBe(true));
		expect(result.current.value.hits).toHaveLength(1);
		await waitFor(() => expect(result.current.value.count).toBe(1));
	});

	it('runs the logs read only once its handle is retained, never from the render that builds it', async () => {
		const find = jest.spyOn(localDB.collections.logs, 'find');
		const state: QueryStateOf<'logs'> = {
			search: '',
			filters: {},
			sort: { field: 'timestamp', direction: 'desc' },
			limit: 1,
		};
		const readsAtRender: number[] = [];
		const { result } = renderHook(
			() => {
				const handle = useLogsQueryHandle(state);
				readsAtRender.push(find.mock.calls.length);
				return handle;
			},
			{ wrapper: Provider }
		);
		// The render built the handle and nothing read: the owner's retain (an effect) starts it.
		expect(readsAtRender[0]).toBe(0);
		await waitFor(() => expect(result.current.value.ready).toBe(true));
		expect(find).toHaveBeenCalled();
		find.mockRestore();
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
		// The ledger's shape: the screen owns the handle, the rows draw it inside a boundary.
		function Rows({ handle }: { handle: QueryHandle }) {
			const { hits } = useQuerySnapshot(useDrawnHandle(handle), []);
			return <span data-testid="rows">{hits.length}</span>;
		}
		let extend: () => void = () => undefined;
		function Screen() {
			const [limit, setLimit] = React.useState(1);
			extend = () => setLimit(2);
			const handle = useLogsQueryHandle({ ...state, limit });
			return (
				<React.Suspense fallback={<span data-testid="fallback" />}>
					<Rows handle={handle} />
				</React.Suspense>
			);
		}
		const view = render(
			<Provider>
				<Screen />
			</Provider>
		);
		await waitFor(() => expect(view.getByTestId('rows').textContent).toBe('1'));

		// Infinite scroll: the limit extends 1 → 2. The mounted ledger must keep the loaded
		// window until the wider query answers — never the fallback, never an empty window.
		act(() => extend());
		expect(view.queryByTestId('fallback')).toBeNull();
		expect(view.getByTestId('rows').textContent).toBe('1');
		await waitFor(() => expect(view.getByTestId('rows').textContent).toBe('2'));
		expect(view.queryByTestId('fallback')).toBeNull();
	});

	it('rebinds residents when engine db$ moves to another scope', async () => {
		const secondDB = await createEngineDatabase(['products']);
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
		const { result } = renderHook(() => useCollectionQueryHandle('products', state), { wrapper });
		await waitFor(() => expect(current(result.current)?.hits[0]?.id).toBe('old'));

		act(() => {
			activeDB = secondDB;
			listeners.forEach((listener) => listener(secondDB));
		});
		await waitFor(() => expect(current(result.current)?.hits[0]?.id).toBe('new'));
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
		const { result } = renderHook(() => useCollectionQueryHandle('products', state), { wrapper });
		await waitFor(() => expect(current(result.current)?.hits[0]?.id).toBe('before-reset'));

		await engineDB.collections.products.remove();
		await engineDB.addCollections({
			products: engineSyncCollectionCreators().products as never,
		});
		act(() => listeners.forEach((listener) => listener(engineDB)));
		await engineDB.collections.products.insert(
			engineProduct({ uuid: 'after-refill', id: 2, name: 'After refill' })
		);

		await waitFor(() => expect(current(result.current)?.hits[0]?.id).toBe('after-refill'));
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
			({ queryState }) => useProductsQueryHandle(queryState),
			{ wrapper: Provider, initialProps: { queryState: state } }
		);
		await waitFor(() =>
			expect(current(result.current)?.hits[0]).toMatchObject({
				id: 'shirt',
				childrenSearchCount: 1,
			})
		);
		expect(current(result.current)?.searchActive).toBe(true);
		const variationSearch = engine.searchRequireCalls.find(
			({ requirement }) => requirement.collection === 'variations'
		);
		expect(variationSearch?.released).toBe(false);

		rerender({ queryState: { ...state, search: '' } });
		await waitFor(() => expect(Boolean(current(result.current)?.searchActive)).toBe(false));
		expect(variationSearch?.released).toBe(true);
	});

	it.each(['sku', 'barcode'] as const)(
		'matches terms within child %s or across child SKU and barcode',
		async (field) => {
			await engineDB.collections.products.bulkInsert([
				engineProduct({ uuid: 'wanted', id: 10, name: 'Plain parent' }),
				engineProduct({ uuid: 'split', id: 20, name: 'MY' }),
			]);
			await engineDB.collections.variations.bulkInsert([
				engineVariation({
					uuid: 'wanted-child',
					id: 11,
					parent_id: 10,
					name: 'Plain',
					[field]: 'xxMY საბარგულიxx',
				}),
				engineVariation({
					uuid: 'split-child',
					id: 21,
					parent_id: 20,
					name: 'Plain',
					sku: 'MY',
					barcode: 'საბარგული',
				}),
			]);
			const state: QueryStateOf<'products'> = {
				search: 'MY საბარგული',
				filters: { categories: [], tags: [], brands: [] },
				sort: { field: 'name', direction: 'asc' },
				limit: 20,
			};
			const { result, rerender } = renderHook(
				({ queryState }) => useProductsQueryHandle(queryState),
				{
					wrapper: Provider,
					initialProps: { queryState: state },
				}
			);
			await waitFor(() =>
				expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['split', 'wanted'])
			);
			rerender({ queryState: { ...state, search: 'xxMY საბარგულიxx' } });
			await waitFor(() =>
				expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['wanted'])
			);
		}
	);

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
		const { result } = renderHook(() => useProductsQueryHandle(state), {
			wrapper: Provider,
		});

		await waitFor(() => expect(current(result.current)?.hits.length).toBe(0));
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
				sku: 'shared match one',
			}),
			engineVariation({
				uuid: 'second-match',
				id: 21,
				parent_id: 20,
				name: 'Shared Match Two',
				sku: 'shared match two',
			}),
		]);
		const state: QueryStateOf<'products'> = {
			search: 'shared match',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 1,
		};
		const { result } = renderHook(() => useProductsQueryHandle(state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['alpha-shirt'])
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
		const { result } = renderHook(() => useProductsQueryHandle(state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual([
				'first-shirt',
				'later-shirt',
			])
		);
	});

	it('asks for the parents matching children named only while owned, declaring a new set before releasing the old', async () => {
		await engineDB.collections.products.insert(engineProduct({ uuid: 'hat', id: 20, name: 'Hat' }));
		// Parent 99 is NOT resident: only the owner's targeted demand can bring it in.
		await engineDB.collections.variations.bulkInsert([
			engineVariation({ uuid: 'hat-1', id: 21, parent_id: 20, sku: 'blue-hat' }),
			engineVariation({ uuid: 'orphan-1', id: 991, parent_id: 99, sku: 'blue-orphan' }),
		]);
		const state: QueryStateOf<'products'> = {
			search: 'blue',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 20,
		};
		const targeted = () =>
			engine.requireCalls.filter(
				(requirement) =>
					requirement.collection === 'products' && requirement.kind === 'targeted-records'
			) as { remoteIds: string[] }[];
		const targetedEvents = (from: number) =>
			engine.demandEvents.slice(from).filter((event) => event.endsWith(':targeted-records'));
		const { result, unmount } = renderHook(() => useProductsQueryHandle(state), {
			wrapper: Provider,
		});

		await waitFor(() =>
			expect(current(result.current)?.hits.map((hit) => hit.id)).toEqual(['hat'])
		);
		// Catches: the owned demand dropped, or built from resident hits (99 would be missing).
		await waitFor(() => expect(targeted().at(-1)?.remoteIds).toEqual(['20', '99']));
		expect(targetedEvents(0)).toEqual(['require:targeted-records']);

		const before = engine.demandEvents.length;
		await engineDB.collections.variations.insert(
			engineVariation({ uuid: 'orphan-2', id: 771, parent_id: 77, sku: 'blue-other' })
		);
		await waitFor(() => expect(targeted().at(-1)?.remoteIds).toEqual(['20', '77', '99']));
		// Catches: release-before-declare (the composition's old switchMap order).
		expect(targetedEvents(before)).toEqual([
			'require:targeted-records',
			'release:targeted-records',
		]);

		const beforeUnmount = engine.demandEvents.length;
		unmount();
		// Catches: a targeted requirement that outlives its owner.
		await waitFor(() =>
			expect(targetedEvents(beforeUnmount)).toEqual(['release:targeted-records'])
		);
		expect(targetedEvents(0).filter((event) => event.startsWith('require:'))).toHaveLength(2);
		expect(targetedEvents(0).filter((event) => event.startsWith('release:'))).toHaveLength(2);
	});

	it('asks again for the parents a refused targeted fetch left missing', async () => {
		await engineDB.collections.variations.insert(
			engineVariation({ uuid: 'orphan-1', id: 991, parent_id: 99, sku: 'blue-orphan' })
		);
		// The first targeted ask is refused (a transient wire failure); the engine never retries
		// a refused requirement on its own.
		const require = engine.require.bind(engine);
		let refused = 0;
		engine.require = (requirement) => {
			const handle = require(requirement);
			if (requirement.kind !== 'targeted-records' || refused > 0) return handle;
			refused += 1;
			const ready = Promise.reject(new Error('offline'));
			ready.catch(() => undefined);
			return { ...handle, ready };
		};
		const targetedEvents = () =>
			engine.demandEvents.filter((event) => event.endsWith(':targeted-records'));
		renderHook(
			() =>
				useProductsQueryHandle({
					search: 'blue',
					filters: { categories: [], tags: [], brands: [] },
					sort: { field: 'name', direction: 'asc' },
					limit: 20,
				}),
			{ wrapper: Provider }
		);
		await waitFor(() => expect(targetedEvents()).toEqual(['require:targeted-records']));
		// Catches: a declared set remembered past its refusal (Greptile on #2510) — the same ids
		// are asked for again, after the demand's one retry backoff, with the refused ask released.
		await waitFor(
			() =>
				expect(targetedEvents()).toEqual([
					'require:targeted-records',
					'release:targeted-records',
					'require:targeted-records',
				]),
			{ timeout: 2000 }
		);
	});

	it('a reader outliving the owner keeps the rows and asks for no parents', async () => {
		await engineDB.collections.products.insert(engineProduct({ uuid: 'hat', id: 20, name: 'Hat' }));
		await engineDB.collections.variations.bulkInsert([
			engineVariation({ uuid: 'hat-1', id: 21, parent_id: 20, sku: 'blue-hat' }),
			engineVariation({ uuid: 'orphan-1', id: 991, parent_id: 99, sku: 'blue-orphan' }),
		]);
		const targetedEvents = (from: number) =>
			engine.demandEvents.slice(from).filter((event) => event.endsWith(':targeted-records'));
		const handle = queryHandles.acquireProductsQueryHandle(engine, 'test:relation:reader', {
			state: {
				search: 'blue',
				filters: { categories: [], tags: [], brands: [] },
				sort: { field: 'name', direction: 'asc' },
				limit: 20,
			},
			parentSearchFields: ['name'],
			childSearchFields: ['sku'],
		});
		// A reader alone: the read runs, nothing targeted is asked for (readers never declare).
		const stopReading = handle.subscribe(() => undefined);
		await waitFor(() => expect(handle.value.hits.map((hit) => hit.id)).toEqual(['hat']));
		// Catches: `declareRelatedWhileOwned` declaring on a result instead of on ownership.
		expect(targetedEvents(0)).toEqual([]);

		const retained = engine.demandEvents.length;
		const release = handle.retain();
		// Catches: the owned demand not following `owned$` (99 is only reachable through it).
		await waitFor(() => expect(targetedEvents(retained)).toEqual(['require:targeted-records']));

		const released = engine.demandEvents.length;
		release();
		// Catches: a targeted requirement that survives the owner while a reader still holds the
		// read, or one re-declared for the reader.
		await waitFor(() => expect(targetedEvents(released)).toEqual(['release:targeted-records']));
		expect(handle.value.hits.map((hit) => hit.id)).toEqual(['hat']);
		stopReading();
	});

	it('debounces search-select input and bounds its resident results', async () => {
		jest.useFakeTimers();
		await engineDB.collections.categories.bulkInsert([
			{
				uuid: 'a',
				remoteId: '1',
				remoteKey: '1',
				payload: { name: 'Alpha' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				uuid: 'b',
				remoteId: '2',
				remoteKey: '2',
				payload: { name: 'Alpine' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
			{
				uuid: 'c',
				remoteId: '3',
				remoteKey: '3',
				payload: { name: 'Albatross' },
				sync: { revision: '1', partial: false, source: 'woo-rest' },
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);
		const { result } = renderHook(
			() => useSearchSelect('category', { debounceMs: 50, pageSize: 2 }),
			{ wrapper: Provider }
		);
		act(() => result.current.setSearch('al'));
		expect(result.current.search).toBe('al');
		act(() => jest.advanceTimersByTime(49));
		expect(result.current.committedSearch).toBe('');
		act(() => jest.advanceTimersByTime(1));
		expect(result.current.committedSearch).toBe('al');
		jest.useRealTimers();
		await waitFor(() => expect(result.current.handle.value.ready).toBe(true));
		expect(JSON.parse(result.current.handle.key)).toEqual(
			expect.arrayContaining(['search-select', 'category', 'al', 2])
		);
		// Three residents match "al"; the page is two.
		expect(result.current.handle.value.hits).toHaveLength(2);
	});

	/**
	 * #1553: the picker's window was a fixed 50 with no way to grow, so a 5,000-customer store
	 * could only ever be scrolled 50 rows deep. The window is a PAGE now, and the demand the
	 * page declares has to grow with it — a limit the engine never sees pages through
	 * residents only and stops at whatever happens to be local.
	 */
	it('grows the declared window when the search-select pages', async () => {
		const { result } = renderHook(() => useSearchSelect('customer'), { wrapper: Provider });

		expect(result.current.limit).toBe(50);
		await waitFor(() =>
			expect(engine.requireCalls).toContainEqual(
				expect.objectContaining({ collection: 'customers', kind: 'customer-browse', limit: 50 })
			)
		);

		act(() => result.current.extendLimit());

		expect(result.current.limit).toBe(100);
		await waitFor(() =>
			expect(engine.requireCalls).toContainEqual(
				expect.objectContaining({ collection: 'customers', kind: 'customer-browse', limit: 100 })
			)
		);
	});

	it('starts every committed search visit back at the first page', async () => {
		jest.useFakeTimers();
		const { result } = renderHook(() => useSearchSelect('customer', { debounceMs: 50 }), {
			wrapper: Provider,
		});

		act(() => result.current.setSearch('ada'));
		act(() => jest.advanceTimersByTime(50));
		expect(result.current.committedSearch).toBe('ada');

		act(() => result.current.extendLimit());
		act(() => result.current.extendLimit());
		expect(result.current.limit).toBe(150);

		act(() => result.current.setSearch('grace'));
		act(() => jest.advanceTimersByTime(50));
		expect(result.current.committedSearch).toBe('grace');
		expect(result.current.limit).toBe(50);

		act(() => result.current.setSearch('ada'));
		act(() => jest.advanceTimersByTime(50));
		expect(result.current.committedSearch).toBe('ada');
		expect(result.current.limit).toBe(50);
		// The reset reaches the handle: the read asked for is page one of the new search.
		expect(JSON.parse(result.current.handle.key)).toEqual(
			expect.arrayContaining(['search-select', 'customer', 'ada', 50])
		);
		await act(async () => Promise.resolve());
	});

	describe('the search-select handle', () => {
		const keyOf = (handle: { key: string }) => JSON.parse(handle.key) as unknown[];

		it('is keyed by the committed search and the limit, and holds for an unchanged key', () => {
			jest.useFakeTimers();
			const { result, rerender } = renderHook(
				() => useSearchSelect('customer', { debounceMs: 50 }),
				{ wrapper: Provider }
			);
			const first = result.current.handle;
			expect(keyOf(first)).toEqual(expect.arrayContaining(['search-select', 'customer', '', 50]));

			rerender();
			// Typing alone is not a new read: the key moves on the debounced commit.
			act(() => result.current.setSearch('ada'));
			expect(result.current.handle).toBe(first);

			act(() => jest.advanceTimersByTime(50));
			const searched = result.current.handle;
			expect(searched).not.toBe(first);
			expect(keyOf(searched)).toEqual(expect.arrayContaining(['ada', 50]));

			act(() => result.current.extendLimit());
			const extended = result.current.handle;
			expect(extended).not.toBe(searched);
			expect(keyOf(extended)).toEqual(expect.arrayContaining(['ada', 100]));
		});

		it('is one handle for two pickers asking the same question', async () => {
			const first = renderHook(() => useSearchSelect('category'), { wrapper: Provider });
			// The first owner's retain has run: its handle is the registry's for that key.
			await act(async () => undefined);
			const second = renderHook(() => useSearchSelect('category'), { wrapper: Provider });

			expect(second.result.current.handle).toBe(first.result.current.handle);
		});

		it('is a different handle for pickers with different page sizes', async () => {
			const small = renderHook(() => useSearchSelect('category', { pageSize: 10 }), {
				wrapper: Provider,
			});
			await act(async () => undefined);
			const large = renderHook(() => useSearchSelect('category', { pageSize: 20 }), {
				wrapper: Provider,
			});

			expect(large.result.current.handle).not.toBe(small.result.current.handle);
			expect(keyOf(small.result.current.handle)).toContain(10);
			expect(keyOf(large.result.current.handle)).toContain(20);
		});

		it('is retained by the picker: demand while mounted, released on unmount', async () => {
			jest.useFakeTimers();
			const { result, unmount } = renderHook(() => useSearchSelect('customer', { debounceMs: 0 }), {
				wrapper: Provider,
			});
			act(() => result.current.setSearch('ada'));
			act(() => jest.advanceTimersByTime(0));
			jest.useRealTimers();
			await waitFor(() => expect(engine.searchRequireCalls).toHaveLength(1));
			expect(engine.searchRequireCalls[0]?.released).toBe(false);

			unmount();
			await act(async () => undefined);

			expect(engine.searchRequireCalls[0]?.released).toBe(true);
		});
	});

	it('declares coupon refresh demand when the cart coupon picker mounts', async () => {
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

	it('a foreground wait that times out over a wedged lane lets both handles go after unmount', async () => {
		jest.useFakeTimers();
		const { result, unmount } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());
		// A lane that never goes quiet: readiness lands, the quiet wait starts and never ends.
		act(() => engine.setCollectionStatus('coupons', { active: true }));
		const barrier = result.current.whenSettled();
		await act(async () => jest.advanceTimersByTimeAsync(100));
		unmount();

		await act(async () => jest.advanceTimersByTimeAsync(10_000));
		await expect(barrier).resolves.toBe(false);
		await act(async () => jest.advanceTimersByTimeAsync(0));
		// The deadline ended the quiet wait too: nothing still reads (keeps alive) either handle.
		expect(queryHandleCount(engine)).toBe(0);
	});

	it('background wait converges across a coverage-generation change: the successor declares before the predecessor releases', async () => {
		jest.useFakeTimers();
		const log: string[] = [];
		const originalRequire = engine.require.bind(engine);
		engine.require = (requirement) => {
			const handle = originalRequire(requirement);
			log.push(`require:${requirement.id}`);
			return {
				...handle,
				release: () => {
					log.push(`release:${requirement.id}`);
					handle.release();
				},
			};
		};
		const standingCoupons = () => [
			...new Set(
				engine.requireCalls
					.filter((call) => call.collection === 'coupons' && !call.id.includes(':rearm'))
					.map((call) => call.id)
			),
		];
		engine.refreshReleased = true;
		const { result } = renderHook(() => useAppliedCouponReferenceDemand(true), {
			wrapper: Provider,
		});
		await act(async () => Promise.resolve());
		const controller = new AbortController();
		const background = result.current.whenSettledInBackground(controller.signal);
		await act(async () => jest.advanceTimersByTimeAsync(2_000));
		const [before] = standingCoupons();

		// A reset of the coupons collection while the wait is armed: a new handle, a new demand.
		act(() => engine.setCollectionStatus('coupons', { coverageGeneration: 1 }));
		await act(async () => jest.advanceTimersByTimeAsync(0));
		const after = standingCoupons().find((id) => id !== before);
		expect(after).toBeDefined();
		expect(log.indexOf(`require:${after}`)).toBeLessThan(log.lastIndexOf(`release:${before}`));

		// The other owner finishes: the superseded handle's re-arm is met, and the wait settles.
		engine.refreshReleased = false;
		await act(async () => jest.advanceTimersByTimeAsync(30_000));
		await expect(background).resolves.toBe(true);
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
				remoteKey: '7',
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
				remoteKey: '42',
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
			expect(result.current.handle.value.hits.map((hit) => hit.id)).toEqual(['cashier-grace'])
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
	 * `useQuery` no longer exists. The contract moved DOWN a layer into the
	 * handle hooks: every screen that mounts a grid (products.tsx, orders,
	 * customers, tax-rates, the logs viewer) calls one of them and immediately
	 * hands the handle to a reader (`value`, `subscribe`, `whenAnswered`) and its
	 * footer (`sync`) on the very first render, before anything has emitted. A hook
	 * that returns `undefined` — or a handle with a hole in it — crashes the screen
	 * exactly the way 1.9 did.
	 *
	 * The guard is deliberately at the HOOK level rather than at
	 * `observeEngineQuery`/`useLocalQuery$`: the low-level observables were never
	 * what crashed, the value a component destructures was.
	 */
	describe('first render never yields an undefined handle (resurrected 1.9 guard)', () => {
		const HANDLE_METHODS = [
			'subscribe',
			'retain',
			'observe',
			'sync',
			'whenReady',
			'declareOnce',
			'retry',
			'whenAnswered',
		] as const;

		const productsState: QueryStateOf<'products'> = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		};

		type Captured = {
			handle: QueryHandle | undefined;
			/** Whether the handle already had an answer during the first render pass. */
			hadValueOnFirstRender: boolean;
		};

		/**
		 * Render a handle hook and capture what it returned on the FIRST render
		 * pass — recorded during the render phase, so the snapshot predates effects
		 * and any emission. The probe destructures the way a real screen does, so an
		 * `undefined` return throws inside render (the 1.9 crash, verbatim).
		 */
		function captureFirstRender(useHandle: () => QueryHandle, value?: FakeEngine): Captured {
			const captured: Captured = { handle: undefined, hadValueOnFirstRender: false };
			let renders = 0;

			function Probe() {
				const handle = useHandle();
				renders += 1;
				// What every consuming screen does immediately. If `handle` is
				// undefined this line throws "Cannot destructure property ... of
				// undefined", which is the bug this guard exists to catch.
				const { value: snapshot, subscribe, sync } = handle;
				if (renders === 1) {
					captured.handle = handle;
					captured.hadValueOnFirstRender = snapshot.ready;
				}
				return (
					<div>
						{[snapshot, subscribe, sync].every((field) => field !== undefined && field !== null)
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

		function expectUsableHandle(captured: Captured) {
			expect(captured.handle).toBeDefined();
			expect(captured.handle).not.toBeNull();
			// A snapshot a reader can destructure straight away, and every method callable —
			// "defined" is not enough if a field is a placeholder a consumer cannot use.
			expect(captured.handle?.value).toMatchObject({
				hits: expect.any(Array),
				count: expect.any(Number),
			});
			for (const method of HANDLE_METHODS) {
				expect(typeof captured.handle?.[method]).toBe('function');
			}
		}

		it.each([
			['products grid', () => useCollectionQueryHandle('products', productsState)],
			[
				'orders grid',
				() =>
					useCollectionQueryHandle('orders', {
						search: '',
						filters: {},
						sort: { field: 'date_created_gmt', direction: 'desc' },
						limit: 10,
					}),
			],
			[
				'customers grid',
				() =>
					useCollectionQueryHandle('customers', {
						search: '',
						filters: {},
						sort: { field: 'last_name', direction: 'asc' },
						limit: 10,
					}),
			],
			[
				'tax-rates',
				() =>
					useCollectionQueryHandle('tax-rates', {
						search: '',
						filters: {},
						sort: { field: 'id', direction: 'asc' },
						limit: 10,
					}),
			],
			['POS relational products grid', () => useProductsQueryHandle(productsState)],
		] as [string, () => QueryHandle][])(
			'%s is fully populated on its first render',
			async (_label, useHandle) => {
				const captured = captureFirstRender(useHandle);

				expectUsableHandle(captured);

				await act(async () => {
					await Promise.resolve();
				});
			}
		);

		it('populates the products handle BEFORE the query emits', async () => {
			const captured = captureFirstRender(() =>
				useCollectionQueryHandle('products', productsState)
			);

			// The 1.9 comment verbatim: the crash was the window between mount and the
			// first emission. Assert the handle was usable while that window was open.
			expect(captured.hadValueOnFirstRender).toBe(false);
			expectUsableHandle(captured);

			await act(async () => {
				await Promise.resolve();
			});
		});

		/**
		 * Cold start — the engine's database is still opening, so `active()` is null
		 * and bootstrap demand rejects. This is the real-app window the 1.9 crash
		 * lived in; the handles must DEGRADE (constructible, empty) rather than
		 * hand a screen `undefined`.
		 */
		it.each([
			['products grid', () => useCollectionQueryHandle('products', productsState)],
			['POS relational products grid', () => useProductsQueryHandle(productsState)],
		] as [string, () => QueryHandle][])(
			'%s survives a first render against an unopened engine',
			async (_label, useHandle) => {
				const pending = createPendingFakeEngine(engineDB);

				const captured = captureFirstRender(useHandle, pending.engine);

				expectUsableHandle(captured);

				await act(async () => {
					pending.open();
					await Promise.resolve();
				});
			}
		);

		/**
		 * The pickers hand a handle too: a list reads it on the first render, so the
		 * handle (and the paging the list wires) must be there before anything has emitted —
		 * on a cold engine too.
		 */
		it.each([
			['customer', false],
			['category', false],
			['customer', true],
		] as const)(
			'the %s search-select hands a usable handle on its first render (unopened engine: %s)',
			async (collection, unopened) => {
				const pending = unopened ? createPendingFakeEngine(engineDB) : undefined;
				let first: ReturnType<typeof useSearchSelect> | undefined;
				function Probe() {
					const select = useSearchSelect(collection);
					first ??= select;
					return null;
				}
				render(
					<Provider value={pending?.engine}>
						<Probe />
					</Provider>
				);

				expect(typeof first?.handle.subscribe).toBe('function');
				expect(first?.handle.value).toBeDefined();
				expect(typeof first?.handle.whenAnswered).toBe('function');
				expect(typeof first?.setSearch).toBe('function');
				expect(typeof first?.extendLimit).toBe('function');
				expect(first?.limit).toBe(50);

				await act(async () => {
					pending?.open();
					await Promise.resolve();
				});
			}
		);

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
