import { defer, firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';

import type { EngineRequirement } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../src/engine-query';
import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	type DemandPlan,
	queryHandleCount,
	queryHandleResource,
	type QueryHandleSpec,
	type QuerySnapshot,
} from '../src/query-handle';
import {
	createEngineDatabase,
	createFakeEngine,
	engineProduct,
	type FakeEngine,
} from '../src/testing';

import type { QueryResult } from '../src/query-result';
import type { RxCollection, RxDatabase } from 'rxdb';

type Result = QueryResult<RxCollection>;

const EMPTY: Result = { count: 0, hits: [] };

function searchPlan(term: string): DemandPlan {
	const demand: EngineRequirement[] = [
		{ kind: 'search', collection: 'products', term, limit: 20, id: 'x' } as EngineRequirement,
	];
	return {
		collection: 'products',
		requirementsFor: (overlay) =>
			demand.map((requirement) => ({
				...requirement,
				id: `${overlay.id}:${requirement.kind}`,
				...(overlay.priority !== undefined ? { priority: overlay.priority } : {}),
				...(overlay.forceRefresh ? { forceRefresh: true } : {}),
			})),
		represented: true,
		isUnfiltered: false,
	};
}

/** Let the microtask-deferred release run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('query handle', () => {
	let database: RxDatabase;
	let engine: FakeEngine;

	beforeEach(async () => {
		database = await createEngineDatabase(['products']);
		engine = createFakeEngine(database);
	});

	afterEach(async () => {
		await database.close();
	});

	function spec(
		key: string,
		result$: Observable<Result>,
		plans: DemandPlan[] = []
	): QueryHandleSpec<Result> {
		return {
			key,
			result$: () => result$,
			demands: plans.map((plan, index) => createDemand(engine, `${key}:${index}`, plan)),
			activeCollections: ['products'],
			censusScoped: false,
			observeActive: () => of(false),
		};
	}

	function acquire(key: string, result$: Observable<Result>, plans: DemandPlan[] = []) {
		return acquireQueryHandle(engine, key, (onStop) =>
			createQueryHandle(engine, spec(key, result$, plans), EMPTY, onStop)
		);
	}

	it('is one object per key while retained, and a fresh one after its last reader leaves', async () => {
		const first = acquire('a', of(EMPTY));
		expect(acquire('a', of(EMPTY))).toBe(first);
		expect(queryHandleCount(engine)).toBe(1);

		const unsubscribe = first.subscribe(() => undefined);
		expect(acquire('a', of(EMPTY))).toBe(first);
		unsubscribe();
		// Still registered inside the task: a successor subscribing now keeps it.
		expect(acquire('a', of(EMPTY))).toBe(first);
		await settle();
		expect(queryHandleCount(engine)).toBe(0);
		expect(acquire('a', of(EMPTY))).not.toBe(first);
	});

	it('does nothing until the first reader subscribes, then reads and declares', async () => {
		const results = new Subject<Result>();
		const handle = acquire('b', results, [searchPlan('ada')]);
		expect(handle.value.ready).toBe(false);
		expect(engine.searchRequireCalls).toHaveLength(0);

		const seen: QuerySnapshot<Result>[] = [];
		const unsubscribe = handle.subscribe(() => seen.push(handle.value));
		expect(engine.searchRequireCalls).toHaveLength(1);
		expect(handle.value.pending).toBe(true);

		results.next({ count: 1, hits: [{ id: 'p1', record: {} as never }] });
		expect(handle.value.ready).toBe(true);
		expect(handle.value.count).toBe(1);
		expect(seen.at(-1)).toBe(handle.value);

		unsubscribe();
		await settle();
		expect(engine.searchRequireCalls[0]?.released).toBe(true);
		expect(handle.value.pending).toBe(false);
	});

	it('releases after the successor declares when a reader moves between handles in one task', async () => {
		const a = acquire('a', of(EMPTY), [searchPlan('ada')]);
		const b = acquire('b', of(EMPTY), [searchPlan('ada')]);
		const leaveA = a.subscribe(() => undefined);
		// React: cleanup of the old effect, then setup of the new one, synchronously.
		leaveA();
		b.subscribe(() => undefined);
		await settle();
		const search = engine.demandEvents.filter((event) => event.endsWith(':search'));
		// require (a), require (b), release (a) — never require, release, require.
		expect(search).toEqual(['require:search', 'require:search', 'release:search']);
	});

	it('publishes one snapshot and holds it while nothing changes', () => {
		const results = new Subject<Result>();
		const handle = acquire('c', results);
		let notified = 0;
		handle.subscribe(() => (notified += 1));
		const hit = { id: 'p1', record: {} as never };
		results.next({ count: 1, hits: [hit] });
		const snapshot = handle.value;
		expect(notified).toBe(1);
		expect(snapshot).toMatchObject({ ready: true, count: 1, active: false, pending: false });
		// A second subscriber sees the same object; no emission for nothing.
		handle.subscribe(() => (notified += 1));
		expect(handle.value).toBe(snapshot);
		expect(notified).toBe(1);
	});

	it('reads engine rows and answers the resource once they land', async () => {
		await database.collections.products.insert(engineProduct({ uuid: 'p1', id: 1, name: 'One' }));
		const handle = acquire(
			'd',
			observeEngineQuery(engine, { collection: 'products', sort: [{ id: 'asc' }] })
		);
		const resource = queryHandleResource(handle);
		const result = await firstValueFrom(
			new Observable<Result>((subscriber) => {
				const unsubscribe = handle.subscribe(() => {
					if (handle.value.ready) subscriber.next(handle.value.result);
				});
				if (handle.value.ready) subscriber.next(handle.value.result);
				return unsubscribe;
			})
		);
		expect(result.hits.map((hit) => hit.id)).toEqual(['p1']);
		expect(resource.read().hits.map((hit) => hit.id)).toEqual(['p1']);
		resource.destroy();
	});

	it('rethrows a failed read through the resource and retries it for the next reader', async () => {
		let attempts = 0;
		const handle = acquireQueryHandle(engine, 'f', (registry) =>
			createQueryHandle(
				engine,
				{
					...spec('f', of(EMPTY)),
					// Like `observeEngineQuery`, the read runs again on every subscription.
					result$: () =>
						defer(() => {
							attempts += 1;
							return attempts === 1 ? throwError(() => new Error('storage gone')) : of(EMPTY);
						}),
				},
				EMPTY,
				registry
			)
		);
		const resource = queryHandleResource(handle);
		expect(() => resource.read()).toThrow('storage gone');
		expect(handle.value.error).toBeInstanceOf(Error);
		resource.destroy();
		await settle();
		// A new reader asks the engine again and gets an answer.
		const again = queryHandleResource(handle);
		expect(again.read()).toEqual(EMPTY);
		expect(attempts).toBe(2);
		again.destroy();
	});

	it('carries rows and total in one frame, and keeps the last rows across a restart', async () => {
		const results = new Subject<Result>();
		const key = 'g';
		const plan = searchPlan('ada');
		const handle = acquireQueryHandle(engine, key, (registry) =>
			createQueryHandle(
				engine,
				{ ...spec(key, results, [plan]), censusScoped: true },
				EMPTY,
				registry
			)
		);
		engine.setCensusTotal('products', 7);
		const frames: { count: number; total: number | null }[] = [];
		let leave = handle.subscribe(() =>
			frames.push({ count: handle.value.count, total: handle.value.total })
		);
		results.next({ count: 1, hits: [{ id: 'p1', record: {} as never }] });
		await settle();
		// Never a frame pairing the new rows with a stale total.
		expect(frames.filter((frame) => frame.count === 1).every((frame) => frame.total === 7)).toBe(
			true
		);

		leave();
		await settle();
		expect(queryHandleCount(engine)).toBe(0);
		// The object was kept by a reader and retained again: it re-enters the registry and
		// opens on the rows it last had, not on empty ones.
		leave = handle.subscribe(() => undefined);
		expect(handle.value.count).toBe(1);
		expect(acquire(key, results)).toBe(handle);
		leave();
	});

	it('sync declares a forced, top-priority copy of the demand and drains the scheduler', async () => {
		const handle = acquire('e', of(EMPTY), [searchPlan('ada')]);
		handle.subscribe(() => undefined);
		await handle.sync();
		const forced = engine.requireCalls.find((call) => call.id?.endsWith(':sync:search'));
		expect(forced).toMatchObject({ priority: 1000, forceRefresh: true });
		expect(engine.syncCalls).toEqual(['scheduler-drain']);
	});
});
