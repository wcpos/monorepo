import { defer, firstValueFrom, Observable, of, Subject, throwError } from 'rxjs';

import type { EngineRequirement } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../src/engine-query';
import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	type DemandPlan,
	NOT_ATTEMPTED,
	queryHandleAnswers$,
	queryHandleCount,
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

function refreshPlan(): DemandPlan {
	return {
		collection: 'products',
		requirementsFor: (overlay) => [
			{ kind: 'refresh', collection: 'products', id: `${overlay.id}:refresh` } as EngineRequirement,
		],
		represented: false,
		isUnfiltered: true,
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
		// Built, not yet started: a render that never commits leaves nothing behind.
		expect(queryHandleCount(engine)).toBe(0);

		const unsubscribe = first.subscribe(() => undefined);
		expect(queryHandleCount(engine)).toBe(1);
		expect(acquire('a', of(EMPTY))).toBe(first);
		unsubscribe();
		// Still registered inside the task: a successor subscribing now keeps it.
		expect(acquire('a', of(EMPTY))).toBe(first);
		await settle();
		expect(queryHandleCount(engine)).toBe(0);
		expect(acquire('a', of(EMPTY))).not.toBe(first);
	});

	it('a reader starts the read and declares nothing; an owner declares; each release lands a microtask later', async () => {
		const results = new Subject<Result>();
		const handle = acquire('b', results, [searchPlan('ada')]);
		expect(handle.value.ready).toBe(false);
		expect(engine.searchRequireCalls).toHaveLength(0);

		const seen: QuerySnapshot<Result>[] = [];
		const unsubscribe = handle.subscribe(() => seen.push(handle.value));
		// The read is live, the demand is not: readers never declare.
		expect(engine.searchRequireCalls).toHaveLength(0);
		results.next({ count: 1, hits: [{ id: 'p1', record: {} as never }] });
		expect(handle.value.ready).toBe(true);
		expect(handle.value.count).toBe(1);
		expect(seen.at(-1)).toBe(handle.value);

		const release = handle.retain();
		expect(engine.searchRequireCalls).toHaveLength(1);
		expect(handle.value.pending).toBe(true);

		// The owner leaves: the demand goes, the read stays for the reader.
		release();
		await settle();
		expect(engine.searchRequireCalls[0]?.released).toBe(true);
		expect(handle.value.pending).toBe(false);
		expect(queryHandleCount(engine)).toBe(1);

		unsubscribe();
		await settle();
		expect(queryHandleCount(engine)).toBe(0);
	});

	it('releases after the successor declares when a reader moves between handles in one task', async () => {
		const a = acquire('a', of(EMPTY), [searchPlan('ada')]);
		const b = acquire('b', of(EMPTY), [searchPlan('ada')]);
		const leaveA = a.retain();
		// React: cleanup of the old effect, then setup of the new one, synchronously.
		leaveA();
		b.retain();
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

	it('reads engine rows and answers once they land', async () => {
		await database.collections.products.insert(engineProduct({ uuid: 'p1', id: 1, name: 'One' }));
		const handle = acquire(
			'd',
			observeEngineQuery(engine, { collection: 'products', sort: [{ id: 'asc' }] })
		);
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
		await expect(handle.whenAnswered()).resolves.toBeUndefined();
	});

	it('rejects a failed read to its reader and retries it for the next reader', async () => {
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
		const leave = handle.subscribe(() => undefined);
		expect(handle.value.error).toBeInstanceOf(Error);
		await expect(handle.whenAnswered()).rejects.toThrow('storage gone');
		leave();
		await settle();
		// A new reader asks the engine again and gets an answer.
		const leaveAgain = handle.subscribe(() => undefined);
		expect(handle.value).toMatchObject({ ready: true, error: null, result: EMPTY });
		expect(attempts).toBe(2);
		leaveAgain();
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

	it("mirrors the key's new owner when a kept handle restarts after its replacement was acquired", async () => {
		const plan = searchPlan('ada');
		const first = acquire('h', of(EMPTY), [plan]);
		const leaveFirst = first.retain();
		leaveFirst();
		await settle();
		const results = new Subject<Result>();
		const second = acquire('h', results, [searchPlan('ada')]);
		expect(second).not.toBe(first);
		second.retain();
		const declaredBefore = engine.searchRequireCalls.length;

		// An owner that kept the first object holds it again: no second read, no second demand.
		first.retain();
		expect(engine.searchRequireCalls.length).toBe(declaredBefore);
		results.next({ count: 1, hits: [{ id: 'p1', record: {} as never }] });
		expect(first.value.count).toBe(1);
		expect(first.value.result).toBe(second.value.result);
		expect(queryHandleCount(engine)).toBe(1);
		// The mirror answers for its owner: readiness and sync are the owner's.
		await expect(first.whenReady()).resolves.toEqual(await second.whenReady());
		await first.sync();
		expect(engine.requireCalls.some((call) => call.id?.startsWith('h:0:sync'))).toBe(true);
	});

	it("lets a new reader of a mirror retry the owner's failed read", async () => {
		let attempts = 0;
		const failing = (key: string) =>
			acquireQueryHandle(engine, key, (registry) =>
				createQueryHandle(
					engine,
					{
						...spec(key, of(EMPTY)),
						result$: () =>
							defer(() => {
								attempts += 1;
								// The kept handle's own read (1) and the owner's first read (2) fail.
								return attempts <= 2 ? throwError(() => new Error('storage gone')) : of(EMPTY);
							}),
					},
					EMPTY,
					registry
				)
			);
		const kept = failing('j');
		kept.subscribe(() => undefined)();
		await settle();
		const owner = failing('j');
		owner.subscribe(() => undefined);
		expect(owner.value.error).toBeInstanceOf(Error);
		// `kept` mirrors `owner`: a reader of the mirror is a reader of the owner, so the owner's
		// retry path runs and both answer.
		kept.subscribe(() => undefined);
		expect(attempts).toBe(3);
		expect(kept.value.error).toBeNull();
		expect(kept.value.ready).toBe(true);
		expect(owner.value.ready).toBe(true);
		// And again for a later reader, should the owner fail once more.
		kept.subscribe(() => undefined);
		expect(attempts).toBe(3);
	});

	it('retries a read that failed synchronously while another reader stayed subscribed', () => {
		let attempts = 0;
		const handle = acquireQueryHandle(engine, 'i', (registry) =>
			createQueryHandle(
				engine,
				{
					...spec('i', of(EMPTY)),
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
		handle.subscribe(() => undefined);
		expect(handle.value.error).toBeInstanceOf(Error);
		// The first reader is still there; the second asks again and gets the answer.
		handle.subscribe(() => undefined);
		expect(attempts).toBe(2);
		expect(handle.value.ready).toBe(true);
	});

	it('withdraws the previous error when a retry starts, so the new reader waits on the new read', async () => {
		let attempts = 0;
		const late = new Subject<Result>();
		const handle = acquireQueryHandle(engine, 'k', (registry) =>
			createQueryHandle(
				engine,
				{
					...spec('k', of(EMPTY)),
					result$: () =>
						defer(() => {
							attempts += 1;
							return attempts === 1 ? throwError(() => new Error('storage gone')) : late;
						}),
				},
				EMPTY,
				registry
			)
		);
		handle.subscribe(() => undefined);
		expect(handle.value.error).toBeInstanceOf(Error);
		handle.subscribe(() => undefined);
		expect(handle.value.error).toBeNull();
		// The wait is on the new read, not the old error.
		const answered = handle.whenAnswered();
		late.next({ count: 2, hits: [] });
		await expect(answered).resolves.toBeUndefined();
		expect(handle.value.count).toBe(2);
	});

	it('keeps notifying a subscription whose callback another subscription shared and released', () => {
		const results = new Subject<Result>();
		const handle = acquire('l', results);
		let notified = 0;
		const shared = () => (notified += 1);
		const leaveA = handle.subscribe(shared);
		handle.subscribe(shared);
		leaveA();
		results.next({ count: 1, hits: [] });
		// The subscription that stayed is still told, once.
		expect(notified).toBe(1);
	});

	it('retry asks the engine again after a failed read, withdrawing the error first', () => {
		let attempts = 0;
		const late = new Subject<Result>();
		const handle = acquireQueryHandle(engine, 'n', (registry) =>
			createQueryHandle(
				engine,
				{
					...spec('n', of(EMPTY)),
					result$: () =>
						defer(() => {
							attempts += 1;
							return attempts === 1 ? throwError(() => new Error('storage gone')) : late;
						}),
				},
				EMPTY,
				registry
			)
		);
		handle.subscribe(() => undefined);
		expect(handle.value.error).toBeInstanceOf(Error);
		handle.retry();
		expect(attempts).toBe(2);
		expect(handle.value.error).toBeNull();
		late.next({ count: 3, hits: [] });
		expect(handle.value.count).toBe(3);
		// Live read: a retry is a no-op.
		handle.retry();
		expect(attempts).toBe(2);
	});

	it('the answers stream skips a failed read and is still listening after the retry', () => {
		let attempts = 0;
		const reads = [new Subject<Result>(), new Subject<Result>()];
		const handle = acquireQueryHandle(engine, 'answers', (registry) =>
			createQueryHandle(
				engine,
				{
					...spec('answers', of(EMPTY)),
					result$: () =>
						defer(() => {
							attempts += 1;
							return reads[attempts - 1];
						}),
				},
				EMPTY,
				registry
			)
		);
		const seen: number[] = [];
		let closed = false;
		queryHandleAnswers$(handle).subscribe({
			next: (result) => seen.push(result.count),
			error: () => {
				closed = true;
			},
		});
		reads[0].next({ count: 1, hits: [] });
		reads[0].error(new Error('storage gone'));
		expect(handle.value.error).toBeInstanceOf(Error);
		expect(closed).toBe(false);
		handle.retry();
		reads[1].next({ count: 2, hits: [] });
		expect(seen).toEqual([1, 2]);
	});

	it('whenAnswered settles on the first answer, rejects on a failure, and waits on the retry', async () => {
		let attempts = 0;
		const late = new Subject<Result>();
		const handle = acquireQueryHandle(engine, 'o', (registry) =>
			createQueryHandle(
				engine,
				{
					...spec('o', of(EMPTY)),
					result$: () =>
						defer(() => {
							attempts += 1;
							return attempts === 1 ? throwError(() => new Error('storage gone')) : late;
						}),
				},
				EMPTY,
				registry
			)
		);
		// Before anything subscribes: a stable promise nobody has settled.
		const first = handle.whenAnswered();
		expect(handle.whenAnswered()).toBe(first);
		handle.subscribe(() => undefined);
		await expect(first).rejects.toThrow('storage gone');
		await expect(handle.whenAnswered()).rejects.toThrow('storage gone');
		handle.retry();
		const second = handle.whenAnswered();
		expect(second).not.toBe(first);
		late.next({ count: 1, hits: [] });
		await expect(second).resolves.toBeUndefined();
		await expect(handle.whenAnswered()).resolves.toBeUndefined();
	});

	it('a read that asks the engine as part of reading does so only while owned', async () => {
		// The relational products lookup: a targeted requirement declared from inside the read.
		const asked: boolean[] = [];
		const handle = acquireQueryHandle(engine, 'p', (registry) =>
			createQueryHandle(
				engine,
				{
					...spec('p', of(EMPTY)),
					result$: (_engine, owned$) =>
						new Observable<Result>((subscriber) => {
							const ownership = owned$.subscribe((owned) => asked.push(owned));
							subscriber.next(EMPTY);
							return () => ownership.unsubscribe();
						}),
				},
				EMPTY,
				registry
			)
		);
		const leaveReader = handle.subscribe(() => undefined);
		expect(asked).toEqual([false]);
		const release = handle.retain();
		expect(asked).toEqual([false, true]);
		// The owner leaves, the reader stays: the ask is withdrawn, the read goes on.
		release();
		await settle();
		expect(asked).toEqual([false, true, false]);
		expect(handle.value.ready).toBe(true);
		leaveReader();
	});

	it('sync declares a forced, top-priority copy of the demand and drains the scheduler', async () => {
		const handle = acquire('e', of(EMPTY), [searchPlan('ada')]);
		handle.retain();
		await handle.sync();
		const forced = engine.requireCalls.find((call) => call.id?.endsWith(':sync:search'));
		expect(forced).toMatchObject({ priority: 1000, forceRefresh: true });
		expect(engine.syncCalls).toEqual(['scheduler-drain']);
	});

	it('declareOnce asks the engine afresh for the first demand, releases it, and honours abort', async () => {
		// Another owner holds the scheduler row: the standing declaration settles `released`.
		engine.refreshReleased = true;
		const handle = acquire('o', of(EMPTY), [refreshPlan()]);
		handle.retain();
		await expect(handle.whenReady()).resolves.toEqual(NOT_ATTEMPTED);

		// The standing declaration settled once; only a fresh declaration can see the owner finish.
		engine.refreshReleased = false;
		await expect(handle.declareOnce()).resolves.toEqual({ attempted: true, fetched: false });
		const rearms = () => engine.requireCalls.filter((call) => call.id?.endsWith(':rearm:refresh'));
		expect(rearms()).toHaveLength(1);
		expect(engine.demandEvents.slice(-1)).toEqual(['release:refresh']);

		// An aborted caller declares nothing.
		const aborted = new AbortController();
		aborted.abort();
		await expect(handle.declareOnce(aborted.signal)).resolves.toEqual(NOT_ATTEMPTED);
		expect(rearms()).toHaveLength(1);

		// Aborting mid-wait releases the declaration nobody wants any more.
		const originalRequire = engine.require.bind(engine);
		const released = jest.fn();
		engine.require = (requirement) => {
			const pending = originalRequire(requirement);
			return {
				...pending,
				ready: new Promise(() => undefined),
				release: () => {
					released(requirement.id);
					pending.release();
				},
			};
		};
		const controller = new AbortController();
		const waiting = handle.declareOnce(controller.signal);
		controller.abort();
		expect(released).toHaveBeenCalledWith('o:0:rearm:refresh');
		engine.require = originalRequire;
		void waiting;

		// A handle with no demand has nothing to ask.
		await expect(acquire('p', of(EMPTY)).declareOnce()).resolves.toEqual({
			attempted: true,
			fetched: false,
		});
	});

	it('a handle that projects no total declares its demand and subscribes no coverage verdict', () => {
		const demandOnly = acquireQueryHandle(engine, 'q', (registry) =>
			createQueryHandle(
				engine,
				{ ...spec('q', of(EMPTY), [refreshPlan()]), projectsTotal: false },
				EMPTY,
				registry
			)
		);
		demandOnly.retain();
		expect(engine.requireCalls).toHaveLength(1);
		expect(engine.coverageSubscribeCalls).toEqual([]);
		expect(demandOnly.value).toMatchObject({ ready: true, total: null, laneProgress: null });

		// The control: the same demand on a reading handle asks the engine for its verdict.
		acquire('r', of(EMPTY), [refreshPlan()]).retain();
		expect(engine.coverageSubscribeCalls).not.toEqual([]);
	});
});
