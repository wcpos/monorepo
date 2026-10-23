/**
 * The query handle: one object per query, created outside React, that every reader of a
 * query's results and state shares (roadmap#423, ruled 2026-10-12).
 *
 * A handle owns three things the screens used to assemble per render:
 *
 *  - the READ: the engine query subscription whose rows the snapshot carries;
 *  - the DEMAND: the requirement declaration that asks the engine to fetch what the read
 *    needs, declared when the first reader subscribes and released when the last one leaves;
 *  - the PROJECTIONS: the footer's total, the lane's progress, the search lane's exhaustion
 *    verdict, the collection's activity flag — composed once, into one snapshot.
 *
 * Readers hold `{ value, subscribe }`, the shape the slot primitive ruled for data crossing
 * to an extension (#139), plus the enumerated methods out (`sync`, `whenReady`, `declareOnce`). Nothing a
 * reader does can re-issue the handle: its identity is its `key`, held in a per-engine
 * registry (`acquireQueryHandle`), so a parent's render, a clock tick or a store subscription
 * firing cannot hand the screen a "new" query that is the same query.
 *
 * Lifecycle. `retain` is the owner's: it declares demand while held. `subscribe` and `observe`
 * are readers': they keep the read alive and never declare. The last owner's release stops the
 * demand, and the last reader's release stops the read — one microtask later. The deferral is DECLARE BEFORE RELEASE
 * (monorepo#1614): React runs an effect's cleanup before the next effect's setup, so a reader
 * that moves from handle A to handle B releases A and then subscribes B inside one commit. A
 * release that ran synchronously would let the engine see a zero-subscriber window for the
 * requirement both handles share, and `release()` ABORTS an in-flight fetch by design. Deferred
 * by a microtask, B has declared before A releases, and an identical requirement rejoins the
 * same engine entry. A plain unmount still releases within the same task.
 */

import {
	BehaviorSubject,
	combineLatest,
	defer,
	distinctUntilChanged,
	filter,
	map,
	Observable,
	of,
	shareReplay,
	startWith,
	Subscription,
	switchMap,
	throwError,
} from 'rxjs';

import type {
	CensusTotals,
	CoverageOutcome,
	CoverageTarget,
	CoverageVerdict,
	EngineRequirement,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';

import { observeCoverage } from './engine-query';
import { declareRequirements } from './requirement-bridge';

import type { QueryResult } from './query-result';
import type { RxCollection } from 'rxdb';

/** A rejected declaration is asked again once, after this long. */
const DEMAND_RETRY_BACKOFF_MS = 250;

/**
 * How much of a fetch-to-completion lane has landed locally, while it is still landing (#954).
 *
 * Only a ranged `limit=all` lane — Reports — reports this: it is the one screen that declares
 * "give me every result", so it is the one screen where a partially downloaded window is a
 * silent lie rather than a deliberately small page. `null` once the lane is complete (or was
 * never fetch-to-completion), which is what makes the progress surface self-dismissing.
 */
export type QueryLaneProgress = {
	/** Records the walk has covered so far. */
	downloaded: number;
	/** The range's size per the server's `X-WP-Total`, or null if it never sent one. */
	total: number | null;
};

/**
 * What a settled demand declaration proves about the collection behind it.
 *
 * `attempted: false` is the `released` case of the CoverageOutcome contract: the requirement
 * was handed back without being met, because another engine instance (another tab) owns the
 * scheduler row or the claim was lost mid-drain. That other owner's pull is invisible to this
 * tab's activity counters, so a release must never be read as "the references landed" — the
 * caller has to keep waiting and re-declare rather than act on it.
 */
export type DemandReadiness = {
	attempted: boolean;
	/** At least one requirement was met by a WIRE walk (`fetched`), not served from local rows. */
	fetched: boolean;
};

export const ATTEMPTED: DemandReadiness = { attempted: true, fetched: false };
export const NOT_ATTEMPTED: DemandReadiness = { attempted: false, fetched: false };

export function readinessFrom(outcomes: CoverageOutcome[]): DemandReadiness {
	return {
		attempted: outcomes.every((outcome) => outcome.action !== 'released'),
		fetched: outcomes.some((outcome) => outcome.action === 'fetched'),
	};
}

export function releaseHandles(handles: RequirementHandle[]): void {
	for (const handle of handles) handle.release();
}

/**
 * Which coverage key a query's totals may be read from, or null when nothing the engine
 * tracks stands for this query.
 *
 * `handle.queryKey` is the engine's own answer for a browse/refresh lane, so it wins whenever
 * there is one. A collection seeded by a boot lane (tax rates) declares no requirement at all,
 * so there is no handle to carry a key — the `{lane:'reference'}` arm asks the ENGINE to
 * resolve its own lane key rather than having this layer spell one out (CONTEXT.md: callers
 * never construct lane keys).
 *
 * The `represented || isUnfiltered` gate is what keeps a lane from standing in for a query it
 * only partly covers: a descriptor carrying a condition the wire key cannot express names a
 * DELIBERATE superset, right for demand and wrong for a total. `isUnfiltered` re-admits the
 * reference collections, whose branch reports `represented: false` unconditionally even though
 * an unfiltered view of them maps exactly onto their `<collection>:all` lane.
 * Only the explicitly marked Sales superset bypasses this gate for progress/completeness:
 * a superset lane may prove completeness, never supply a count.
 */
export function coverageTargetFor(input: {
	collection: SyncCollectionName;
	handleQueryKey: string | null;
	represented: boolean;
	coverage: 'exact' | 'superset' | undefined;
	isUnfiltered: boolean;
}): CoverageTarget | null {
	if (!input.represented && !input.isUnfiltered && input.coverage !== 'superset') return null;
	if (input.handleQueryKey !== null) {
		return { collection: input.collection, queryKey: input.handleQueryKey };
	}
	return input.isUnfiltered ? { collection: input.collection, lane: 'reference' } : null;
}

/** The engine declining to vouch — what a query with no coverage target reports. */
const UNKNOWN_COVERAGE: CoverageVerdict = {
	total: null,
	source: 'unknown',
	complete: false,
	fresh: false,
	progress: null,
};
const UNKNOWN_COVERAGE$ = of(UNKNOWN_COVERAGE);
const UNKNOWN_EXHAUSTED$ = of(null as boolean | null);
export const NO_CENSUS_TOTAL$ = of(null as number | null);

/**
 * Identity of a coverage target, so that a RE-declaration naming the same target does not
 * resubscribe the verdict. Every declare pushes a freshly built object; without this the
 * switchMap below would tear the subscription down and republish `unknown`, blinking the
 * footer back to the resident count on every re-declare.
 */
export function coverageTargetKey(target: CoverageTarget | null): string {
	if (target === null) return '';
	return 'queryKey' in target
		? `${target.collection}::${target.queryKey}`
		: `${target.collection}::@reference`;
}

/**
 * The engine's opinion on whether the server has more rows for a SEARCH demand — the signal
 * the grids page on instead of "was the local page short" (`useGuardedExtension`).
 *
 *  - `true`: the walk ended on a short page inside its limit and the lane is still fresh
 *    (`fetchSearch` records `exhausted` as the lane's `complete`). Stale-complete reads as
 *    `false` on purpose: the next end-reached re-declares, the require-plane re-walks (it only
 *    serves local for complete AND fresh), and the verdict settles back to `true`.
 *  - `false`: a walk landed (the standing declaration settled `fetched`) and filled its limit —
 *    more may exist.
 *  - `null`: no opinion. No search lane (browse windows never complete, by design), or the
 *    last declaration did not walk: a failed walk leaves no lane, and a `serve-local` for a
 *    fully resident catalogue leaves none either — in both the local rows ARE the answer, and
 *    reading "no lane" as "more may exist" would grow the limit on every end-reached fire
 *    (offline, or on every render once resident): the #1221 storm by another door. The
 *    verdict cannot tell those apart on its own — an incomplete lane and no lane both report
 *    `source: 'unknown'` — which is why the settle outcome is consulted.
 */
export function exhaustedFromCoverage$(
	engine: RxdbSyncEngine,
	searchLane$: Observable<CoverageTarget | null>,
	fetched$: Observable<boolean>
): Observable<boolean | null> {
	return searchLane$.pipe(
		distinctUntilChanged(
			(previous, current) => coverageTargetKey(previous) === coverageTargetKey(current)
		),
		switchMap((target) =>
			target === null
				? UNKNOWN_EXHAUSTED$
				: combineLatest([observeCoverage(engine, target), fetched$]).pipe(
						map(([verdict, fetched]) => {
							if (verdict.complete && verdict.fresh) return true;
							return fetched ? false : null;
						})
					)
		),
		distinctUntilChanged(),
		shareReplay({ bufferSize: 1, refCount: true })
	);
}

/**
 * The engine's whole-collection census total — the same number the Store Health › Database
 * page shows. `null` until the engine has recorded a census answer for the collection.
 */
export function censusTotal$(
	engine: RxdbSyncEngine,
	collection: SyncCollectionName
): Observable<number | null> {
	return new Observable<CensusTotals>((subscriber) =>
		engine.censusChanges((totals) => subscriber.next(totals))
	).pipe(
		map((totals) => totals[collection]?.total ?? null),
		// The census snapshot arrives async (a cache read); nothing may hold the footer's
		// combineLatest hostage to it, so open with "no answer yet".
		startWith(null as number | null),
		distinctUntilChanged()
	);
}

/**
 * The footer's numbers, composed from the engine's verdict, the collection census, and the
 * query's own resident count — one source of truth, so the footer and the Store Health ›
 * Database page can never disagree about a total.
 *
 * Wherever a census stands for the screen's scope it wins OUTRIGHT — it is the very number the
 * Database page prints in its "on server" column, and it does not move when the cashier filters
 * or types (owner ruling 2026-08-22: one total, all the time). "Showing 3 of 203" says this
 * till knows about 203 products and three of them match; the old per-query denominator made
 * that second number move with every keystroke, and turned a failed search into "Showing 0 of
 * 0" — which reads like an empty till rather than a product the shop does not stock.
 *
 * Preferring the census was also not a tie-break between equivalent counts. The census probe
 * used to hit `wc/v3` while the browse walk counted `wcpos/v2`, so the two deliberately counted
 * different populations (#1400) — which is how the footer and the Database page came to disagree
 * by a handful of records on the same catalogue, wc/v3 being blind to POS visibility. Both read
 * the same wcpos/v2 lane now; the preference order below stands on its own merits.
 *
 * `census$` is `NO_CENSUS_TOTAL$` only where the census cannot honestly stand for the screen at
 * all — a `targeted` subset, addressed by id (the variations under ONE product). Everything
 * else, however it is filtered, reports the collection's census. Those exceptions keep the
 * engine's per-query answer, and name no total at all when there is no answer (below).
 *
 * The local resident count stays the floor in every branch: more residents than the server's
 * last count proves that count outdated, so the larger number wins — stated plainly, never
 * dressed up with a `N+` suffix (owner ruling 2026-08-20: the `+` read as noise, and every
 * locale translated it differently).
 *
 * The numbers carry the result they were computed for, so a snapshot can take rows and total
 * from ONE emission: fed separately, a new result would first pair with the old total and the
 * reader would see two frames, one of them inconsistent.
 */
export function coverageProjectionWithResult$<R extends QueryResult<RxCollection>>(
	engine: RxdbSyncEngine,
	result$: Observable<R>,
	coverageTarget$: Observable<CoverageTarget | null>,
	census$: Observable<number | null>,
	coverage: 'exact' | 'superset' | undefined = 'exact'
): Observable<{ result: R; total: number | null; laneProgress: QueryLaneProgress | null }> {
	const verdict$ = coverageTarget$.pipe(
		distinctUntilChanged(
			(previous, current) => coverageTargetKey(previous) === coverageTargetKey(current)
		),
		switchMap((target) =>
			(target === null ? UNKNOWN_COVERAGE$ : observeCoverage(engine, target)).pipe(
				map((verdict) => ({ verdict, superset: target !== null && coverage === 'superset' }))
			)
		)
	);
	return combineLatest([result$, verdict$, census$]).pipe(
		map(([result, { verdict, superset }, censusTotal]) => {
			const localCount = result.count ?? result.hits.length;
			// `censusTotal` is non-null only where the census honestly stands for this screen
			// (see `censusScoped`) and has landed.
			// A superset lane may prove completeness, never supply a count.
			const serverTotal = superset ? null : (censusTotal ?? verdict.total);
			if (serverTotal !== null) {
				return {
					result,
					total: Math.max(serverTotal, localCount),
					laneProgress: verdict.progress,
				};
			}
			// No server count anywhere. The resident count is a truthful TOTAL only when the
			// engine claims to hold the whole matching set — `complete` is exactly that claim,
			// and a windowed browse lane deliberately never makes it (coverage-verdicts.ts).
			// Otherwise the resident count is just "what has loaded so far", and passing it off
			// as the size of the set is the "Showing 20 of 20" lie.
			return {
				result,
				total: verdict.complete ? localCount : null,
				laneProgress: verdict.progress,
			};
		})
	);
}

/**
 * What a query asks of the engine, compiled by the caller (the query-state translator lives
 * in core; this layer never sees query state). `requirementsFor` overlays an id and, for a
 * forced sync, a priority and `forceRefresh` on the compiled demand.
 */
export type DemandPlan = {
	collection: SyncCollectionName;
	requirementsFor(overlay: {
		id: string;
		priority?: number;
		forceRefresh?: boolean;
	}): EngineRequirement[];
	/** The wire key expresses the whole query (a total may be read from its lane). */
	represented: boolean;
	/** Omitted means exact; only a widened Sales demand proves subset completeness. */
	coverage?: 'exact' | 'superset';
	/** A complete, unfiltered, unsearched read: the reference lane may vouch for it. */
	isUnfiltered: boolean;
};

/** The demand a handle holds for one collection, with the projections the snapshot reads. */
export type Demand = {
	collection: SyncCollectionName;
	coverageTarget$: Observable<CoverageTarget | null>;
	/** The `kind: 'search'` requirement's coverage lane, or null when the demand has none. */
	searchLane$: Observable<CoverageTarget | null>;
	/** True from declaration until the standing declaration settles, however it settles. */
	pending$: Observable<boolean>;
	/** True once the last settled declaration was met by a wire walk (`fetched`), false otherwise. */
	fetched$: Observable<boolean>;
	/** Readiness of the STANDING declaration — the one the handle keeps alive while retained. */
	whenReady(): Promise<DemandReadiness>;
	/** Declares the same requirements once more and releases them; the re-arm after a release. */
	declareOnce(signal?: AbortSignal): Promise<DemandReadiness>;
	/** Declares with top priority and a forced refresh, drains the scheduler, releases. */
	sync(): Promise<void>;
	/** Declare the standing requirements. Idempotent while started. */
	start(): void;
	/** Release the standing requirements. Idempotent while stopped. */
	stop(): void;
};

/**
 * The demand lifecycle, outside React: what core's per-render demand effect did, as a start /
 * stop pair the handle drives from its subscriber count. Everything the effect pinned stays:
 * one retry after a rejected declaration, a readiness barrier that stays pending across the
 * retry, and a superseded declaration that never speaks for its successor.
 */
export function createDemand(engine: RxdbSyncEngine, id: string, plan: DemandPlan): Demand {
	const coverageTarget$ = new BehaviorSubject<CoverageTarget | null>(null);
	const searchLane$ = new BehaviorSubject<CoverageTarget | null>(null);
	const pending$ = new BehaviorSubject(false);
	const fetched$ = new BehaviorSubject(false);
	let ready: Promise<DemandReadiness> = Promise.resolve(ATTEMPTED);
	let started = false;
	let handles: RequirementHandle[] = [];
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	// One epoch per start(): a rejection's retry or a timer from a stopped cycle must not
	// declare into the next one (it would overwrite its handles unreleased).
	let epoch = 0;
	let settleOnCancel: (() => void) | undefined;

	const declare = (cycle: number, retryOnReject: boolean, cancelBarrier: Promise<void>) => {
		if (cycle !== epoch) return;
		pending$.next(true);
		fetched$.next(false);
		const requirements = plan.requirementsFor({ id });
		handles = declareRequirements(engine, requirements);
		coverageTarget$.next(
			coverageTargetFor({
				collection: plan.collection,
				handleQueryKey: handles.find((handle) => handle.queryKey !== null)?.queryKey ?? null,
				represented: plan.represented,
				coverage: plan.coverage,
				isUnfiltered: plan.isUnfiltered,
			})
		);
		const searchIndex = requirements.findIndex(({ kind }) => kind === 'search');
		const searchRequirement = requirements[searchIndex];
		const searchHandle = handles[searchIndex];
		searchLane$.next(
			searchRequirement?.kind === 'search' && searchHandle?.queryKey
				? { collection: searchRequirement.collection, queryKey: searchHandle.queryKey }
				: null
		);
		const settled = Promise.all(handles.map((handle) => handle.ready)).then(readinessFrom);
		// The readiness barrier must stay PENDING across the scheduled retry: settling
		// through the rejection would let whenReady() complete while nothing is in
		// flight yet, and the coupon barrier would read collections that are quiet only
		// because the retry has not started.
		ready = retryOnReject
			? settled.catch(
					() =>
						new Promise<DemandReadiness>((resolve) => {
							if (cycle !== epoch) {
								resolve(NOT_ATTEMPTED);
								return;
							}
							const retried = handles;
							retryTimer = setTimeout(() => {
								if (cycle !== epoch) {
									resolve(NOT_ATTEMPTED);
									return;
								}
								releaseHandles(retried);
								declare(cycle, false, cancelBarrier);
								// declare(false) reassigned `ready` to the retried declaration;
								// chain this barrier to it.
								resolve(ready);
							}, DEMAND_RETRY_BACKOFF_MS);
							// An abandoned declaration proves nothing either — it unblocks
							// whenReady() without the requirement ever having been met.
							void cancelBarrier.then(() => resolve(NOT_ATTEMPTED));
						})
				)
			: settled;
		const barrier = ready;
		const settle = (readiness: DemandReadiness) => {
			// A superseded declaration must not speak for its successor.
			if (ready !== barrier) return;
			fetched$.next(readiness.fetched);
			pending$.next(false);
		};
		void barrier.then(settle, () => settle(NOT_ATTEMPTED));
	};

	return {
		collection: plan.collection,
		coverageTarget$,
		searchLane$,
		pending$,
		fetched$,
		whenReady: () => ready.catch(() => NOT_ATTEMPTED),
		start() {
			if (started) return;
			started = true;
			epoch += 1;
			const cancelBarrier = new Promise<void>((resolve) => {
				settleOnCancel = resolve;
			});
			declare(epoch, true, cancelBarrier);
		},
		stop() {
			if (!started) return;
			started = false;
			epoch += 1;
			settleOnCancel?.();
			pending$.next(false);
			fetched$.next(false);
			searchLane$.next(null);
			coverageTarget$.next(null);
			if (retryTimer !== undefined) clearTimeout(retryTimer);
			// An abandoned declaration proved nothing (the old cleanup's barrier said the same).
			ready = Promise.resolve(NOT_ATTEMPTED);
			const outstanding = handles;
			handles = [];
			releaseHandles(outstanding);
		},
		async sync() {
			const requirements = plan.requirementsFor({
				id: `${id}:sync`,
				priority: 1000,
				forceRefresh: true,
			});
			const syncHandles = declareRequirements(engine, requirements);
			try {
				await Promise.all(syncHandles.map((handle) => handle.ready.catch(() => undefined)));
				await engine.sync('scheduler-drain');
			} finally {
				releaseHandles(syncHandles);
			}
		},
		/**
		 * Re-declare the standing requirements once and release them again.
		 *
		 * The standing declaration settles exactly once, so a caller that has to treat a
		 * `released` outcome as not-attempted cannot simply await `whenReady()` again — it would
		 * get the same already-settled release forever. This asks the engine afresh: once the
		 * owner that released us finishes, the same requirement comes back `serve-local` (inside
		 * the reference dedupe window) or `fetched`.
		 */
		async declareOnce(signal?: AbortSignal): Promise<DemandReadiness> {
			if (signal?.aborted) return NOT_ATTEMPTED;
			const requirements = plan.requirementsFor({ id: `${id}:rearm` });
			const onceHandles = declareRequirements(engine, requirements);
			// `release()` IS the engine's cancellation verb — it aborts queued or in-flight
			// foreground work and settles `ready` as `released`. Without this an aborted caller
			// would keep waiting on (and holding) a declaration nobody wants any more.
			const abortHandler = () => releaseHandles(onceHandles);
			signal?.addEventListener('abort', abortHandler, { once: true });
			try {
				return readinessFrom(await Promise.all(onceHandles.map((handle) => handle.ready)));
			} catch {
				return NOT_ATTEMPTED;
			} finally {
				signal?.removeEventListener('abort', abortHandler);
				releaseHandles(onceHandles);
			}
		},
	};
}

/**
 * Everything a reader of a query sees, as one plain object replaced whole on change.
 *
 * `ready` is false until the engine has answered once; a reader that must not paint an empty
 * grid over a pending read suspends on it (`useQuerySnapshot` in core). `hits[].record`
 * is the engine record (an RxDocument) for first-party readers — the document cache keeps it
 * the same instance while the record is unchanged — and is projected to plain data at the slot
 * boundary, never handed across it (#139).
 */
export type QuerySnapshot<R extends QueryResult<RxCollection> = QueryResult<RxCollection>> = {
	ready: boolean;
	/**
	 * The read failed (storage recovery gave up, a selector the adapter cannot run). The reader
	 * (`useQuerySnapshot` in core) rethrows it into the screen's ErrorBoundary; the handle stops
	 * its read so the next reader restarts it.
	 */
	error: unknown;
	result: R;
	hits: R['hits'];
	count: number;
	searchActive: boolean;
	searchState: R['searchState'];
	/** The engine is pulling the collection(s) this query reads. */
	active: boolean;
	/** From demand declaration until the standing declaration settles. */
	pending: boolean;
	/** The search lane's verdict on whether the server has more; null with no opinion. */
	exhausted: boolean | null;
	/** The size of the set this query is about, or null when nothing can vouch for one. */
	total: number | null;
	laneProgress: QueryLaneProgress | null;
};

export interface QueryHandle<R extends QueryResult<RxCollection> = QueryResult<RxCollection>> {
	/** The canonical query key; the registry's identity. Two handles with one key never coexist. */
	readonly key: string;
	readonly value: Readonly<QuerySnapshot<R>>;
	/**
	 * Read: keeps the engine read alive and is told of every snapshot change; never declares
	 * demand. A reader that outlives the owner (a deferred handle drawn while the next loads)
	 * keeps its rows and nothing else.
	 */
	subscribe(listener: () => void): () => void;
	/**
	 * Own: declares the handle's demand while held, and keeps the read. The screen that acquires
	 * a handle holds it from an effect above its Suspense boundary; the last owner's release
	 * stops the demand one microtask later (DECLARE BEFORE RELEASE), and the read too once no
	 * reader is left.
	 */
	retain(): () => void;
	/** Declares with top priority and a forced refresh, drains the scheduler, releases. */
	sync(): Promise<void>;
	/** Readiness of the standing declaration (the first demand's, for a relational handle). */
	whenReady(): Promise<DemandReadiness>;
	/**
	 * Declare the first demand's requirements once more and release them (`Demand.declareOnce`):
	 * the re-arm for a caller that read the standing declaration as `released` and must ask the
	 * engine afresh. Aborting `signal` releases the declaration. Attempted, with no demand.
	 */
	declareOnce(signal?: AbortSignal): Promise<DemandReadiness>;
	/**
	 * Ask the engine again after a failed read (`value.error`), withdrawing the error first; a
	 * no-op while the read is live. A reader that remounts over a failure (an ErrorBoundary
	 * reset) calls this instead of subscribing anew.
	 */
	retry(): void;
	/**
	 * Settles when the handle has an answer (`value.ready`) and rejects when its read fails:
	 * what a reader throws to suspend on, one stable promise per handle until it settles, then a
	 * fresh one after a failure so a retry can be waited on. Never starts the read itself — the
	 * owner's retain does, from an effect above the Suspense boundary.
	 */
	whenAnswered(): Promise<void>;
	/**
	 * The snapshot stream, one subscription per subscriber, retaining like `subscribe`. For
	 * stream-shaped consumers (a side demand derived from the rows, a barrier that waits for a
	 * quiet collection); React readers take `value` + `subscribe`.
	 */
	observe(): Observable<Readonly<QuerySnapshot<R>>>;
}

export type QueryHandleSpec<R extends QueryResult<RxCollection>> = {
	key: string;
	/**
	 * The read, built once per handle, subscribed while any reader or owner holds it. `owned$`
	 * is true while an owner holds the handle: a read that must ask the engine for something as
	 * part of reading (the relational products lookup) declares only while owned, so a reader
	 * outliving the owner keeps rows and nothing else.
	 */
	result$: (engine: RxdbSyncEngine, owned$: Observable<boolean>) => Observable<R>;
	/** The demands this read needs; the first one's coverage names the total. */
	demands: Demand[];
	/** The collections whose pull activity the snapshot's `active` reflects. */
	activeCollections: SyncCollectionName[];
	/** The census honestly stands for this read (not a targeted subset). */
	censusScoped: boolean;
	coverage?: 'exact' | 'superset';
	/**
	 * False for a handle nobody reads a total from (a demand with no read): the snapshot's
	 * `total` and `laneProgress` stay null and no coverage verdict is subscribed. Default true.
	 */
	projectsTotal?: boolean;
	/** The engine's `active` flag source; injectable so tests can fake it. */
	observeActive: (engine: RxdbSyncEngine, collection: SyncCollectionName) => Observable<boolean>;
};

function emptySnapshot<R extends QueryResult<RxCollection>>(result: R): QuerySnapshot<R> {
	return {
		ready: false,
		error: null,
		result,
		hits: result.hits,
		count: result.count ?? result.hits.length,
		searchActive: Boolean(result.searchActive),
		searchState: result.searchState,
		active: false,
		pending: false,
		exhausted: null,
		total: null,
		laneProgress: null,
	};
}

function sameSnapshot<R extends QueryResult<RxCollection>>(
	previous: QuerySnapshot<R>,
	current: QuerySnapshot<R>
): boolean {
	return (
		previous.ready === current.ready &&
		previous.error === current.error &&
		previous.result === current.result &&
		previous.active === current.active &&
		previous.pending === current.pending &&
		previous.exhausted === current.exhausted &&
		previous.total === current.total &&
		previous.laneProgress?.downloaded === current.laneProgress?.downloaded &&
		previous.laneProgress?.total === current.laneProgress?.total
	);
}

export function createQueryHandle<R extends QueryResult<RxCollection>>(
	engine: RxdbSyncEngine,
	spec: QueryHandleSpec<R>,
	/** The read's value before the engine answers; `ready: false` until it does. */
	initial: R,
	registry?: QueryHandleRegistration<R>
): QueryHandle<R> {
	// One entry per subscription, not per callback: two readers may pass the same function.
	const listeners = new Set<{ notify: () => void }>();
	const snapshot$ = new BehaviorSubject<QuerySnapshot<R>>(emptySnapshot(initial));
	let owners = 0;
	let readers = 0;
	let started = false;
	let demandLive = false;
	const owned$ = new BehaviorSubject(false);
	let read: Subscription | null = null;
	let stopScheduled = false;

	const [primary] = spec.demands;
	const result$ = spec
		.result$(engine, owned$.pipe(distinctUntilChanged()))
		.pipe(shareReplay({ bufferSize: 1, refCount: true }));
	const active$ =
		spec.activeCollections.length === 0
			? of(false)
			: combineLatest(
					spec.activeCollections.map((collection) => spec.observeActive(engine, collection))
				).pipe(
					map((values) => values.some(Boolean)),
					// The engine answers immediately; a fake may not, and the read must never wait
					// on a flag (each field opened on its own default when they were separate).
					startWith(false),
					distinctUntilChanged()
				);
	const pending$ =
		spec.demands.length === 0
			? of(false)
			: combineLatest(spec.demands.map((demand) => demand.pending$)).pipe(
					map((values) => values.some(Boolean)),
					distinctUntilChanged()
				);
	const census$ =
		spec.censusScoped && primary ? censusTotal$(engine, primary.collection) : NO_CENSUS_TOTAL$;
	// Rows and total in ONE emission (the projection carries the result it was computed for),
	// so a reader never sees new rows against the previous total.
	const projected$ =
		primary && spec.projectsTotal !== false
			? coverageProjectionWithResult$(
					engine,
					result$,
					primary.coverageTarget$,
					census$,
					spec.coverage
				)
			: result$.pipe(map((result) => ({ result, total: null, laneProgress: null })));
	const exhausted$ = primary
		? exhaustedFromCoverage$(engine, primary.searchLane$, primary.fetched$).pipe(startWith(null))
		: UNKNOWN_EXHAUSTED$;
	// Deferred so a restart opens on the LAST snapshot's rows and total, not the initial ones.
	const composed$ = defer(() => {
		const last = snapshot$.getValue();
		return combineLatest([
			projected$.pipe(
				map((projected) => ({ ready: true, ...projected })),
				startWith({
					ready: last.ready,
					result: last.result,
					total: last.total,
					laneProgress: last.laneProgress,
				})
			),
			active$,
			pending$,
			exhausted$,
		]).pipe(
			map(
				([
					{ ready, result, total, laneProgress },
					active,
					pending,
					exhausted,
				]): QuerySnapshot<R> => ({
					ready,
					error: null,
					result,
					hits: result.hits,
					count: result.count ?? result.hits.length,
					searchActive: Boolean(result.searchActive),
					searchState: result.searchState,
					active,
					pending,
					exhausted,
					total,
					laneProgress,
				})
			),
			distinctUntilChanged(sameSnapshot)
		);
	});

	// The answer promise: settled by the first ready snapshot, rejected by a read failure, and
	// replaced after a failure so the next wait is for the retry.
	let answered: {
		promise: Promise<void>;
		resolve: () => void;
		reject: (e: unknown) => void;
	} | null = null;
	const answer = () => {
		if (answered) return answered;
		let resolve!: () => void;
		let reject!: (error: unknown) => void;
		const promise = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		// A rejection nobody awaited yet must not surface as unhandled; readers attach later.
		promise.catch(() => undefined);
		answered = { promise, resolve, reject };
		return answered;
	};
	const publish = (snapshot: QuerySnapshot<R>) => {
		if (sameSnapshot(snapshot$.getValue(), snapshot)) return;
		snapshot$.next(snapshot);
		if (snapshot.error) {
			answer().reject(snapshot.error);
			answered = null;
		} else if (snapshot.ready) {
			answer().resolve();
		}
		for (const { notify } of [...listeners]) notify();
	};
	const onReadError = (error: unknown) => {
		// The read is over; the demand stays until the readers leave. Publish the error so the
		// reader rethrows it into the screen's ErrorBoundary; the next reader retries the read.
		read = null;
		publish({ ...snapshot$.getValue(), error });
	};
	const subscribeRead = () => {
		// A retry withdraws the previous error first: a reader arriving now must wait on the
		// new read, not fail on the old answer replayed through `observe()`.
		if (snapshot$.getValue().error) publish({ ...snapshot$.getValue(), error: null });
		// The first composed value restates the current snapshot; nobody is told twice. A read
		// that errors synchronously has already cleared `read`; a closed subscription must not
		// take its place, or the next reader could never retry.
		const subscription = composed$.subscribe({ next: publish, error: onReadError });
		if (!subscription.closed) read = subscription;
	};
	// A handle that stopped while a reader kept the object, then was retained again after the
	// registry handed its key to a successor: it mirrors that owner rather than running the
	// same query beside it (two reads, two demands, two answers for one key).
	let mirrored: QueryHandle<R> | null = null;
	let mirrorHold: (() => void) | null = null;
	const demandOn = () => {
		if (demandLive || mirrored) return;
		demandLive = true;
		for (const demand of spec.demands) demand.start();
		owned$.next(true);
	};
	const demandOff = () => {
		if (!demandLive) return;
		demandLive = false;
		owned$.next(false);
		for (const demand of spec.demands) demand.stop();
		// A reader still holding the object sees the rows it had and no demand in flight.
		publish({ ...snapshot$.getValue(), pending: false });
	};
	const start = () => {
		if (started) return;
		started = true;
		const owner = registry?.claim() ?? null;
		if (owner) {
			mirrored = owner;
			read = owner.observe().subscribe(publish);
			return;
		}
		// Demand first (when an owner holds it), so the first snapshot already carries
		// `pending` and the coverage target.
		if (owners > 0) demandOn();
		subscribeRead();
	};
	const stop = () => {
		if (!started) return;
		started = false;
		// The read first: the demand's reset values must not land in the stored snapshot.
		read?.unsubscribe();
		read = null;
		if (mirrored) {
			mirrorHold?.();
			mirrorHold = null;
			mirrored = null;
			return;
		}
		demandOff();
		registry?.release();
	};
	const wake = () => {
		if (started && mirrored) {
			// A new reader of a mirror is a new reader of the owner: its retry path runs there.
			mirrored.subscribe(() => undefined)();
			return;
		}
		if (started && read === null) {
			// The read failed earlier; a new reader asks the engine again.
			subscribeRead();
			return;
		}
		start();
	};
	// DECLARE BEFORE RELEASE: see the module comment. The settle runs one microtask after a
	// release; an owner or reader arriving inside this task keeps what it needs alive, and a
	// successor handle's owner has declared before this one's demand stops.
	const settle = () => {
		if (stopScheduled) return;
		stopScheduled = true;
		void Promise.resolve().then(() => {
			stopScheduled = false;
			if (owners === 0) {
				if (mirrored) {
					mirrorHold?.();
					mirrorHold = null;
				} else {
					demandOff();
				}
			}
			if (owners === 0 && readers === 0) stop();
		});
	};
	const retainReader = () => {
		readers += 1;
		wake();
	};
	const releaseReader = () => {
		readers -= 1;
		settle();
	};
	const retainOwner = () => {
		owners += 1;
		wake();
		if (mirrored) {
			if (!mirrorHold) mirrorHold = mirrored.retain();
		} else {
			demandOn();
		}
	};
	const releaseOwner = () => {
		owners -= 1;
		settle();
	};

	// Every method is a closure over this scope, never `this`: readers pass them around unbound
	// (`useSyncExternalStore(handle.subscribe, …)`, `sync={handle.sync}`).
	return {
		key: spec.key,
		get value() {
			return snapshot$.getValue();
		},
		subscribe(listener) {
			const entry = { notify: listener };
			listeners.add(entry);
			retainReader();
			let released = false;
			return () => {
				if (released) return;
				released = true;
				listeners.delete(entry);
				releaseReader();
			};
		},
		retain() {
			retainOwner();
			let released = false;
			return () => {
				if (released) return;
				released = true;
				releaseOwner();
			};
		},
		observe() {
			return new Observable<Readonly<QuerySnapshot<R>>>((subscriber) => {
				retainReader();
				const inner = snapshot$.subscribe(subscriber);
				return () => {
					inner.unsubscribe();
					releaseReader();
				};
			});
		},
		// A mirror answers for its owner: the demand in flight is the owner's.
		sync: () =>
			mirrored
				? mirrored.sync()
				: Promise.all(spec.demands.map((demand) => demand.sync())).then(() => undefined),
		whenReady: () =>
			mirrored ? mirrored.whenReady() : primary ? primary.whenReady() : Promise.resolve(ATTEMPTED),
		declareOnce: (signal) =>
			mirrored
				? mirrored.declareOnce(signal)
				: primary
					? primary.declareOnce(signal)
					: Promise.resolve(ATTEMPTED),
		retry: () => {
			if (mirrored) {
				mirrored.retry();
				return;
			}
			if (started && read === null) subscribeRead();
		},
		whenAnswered: () => {
			if (mirrored) return mirrored.whenAnswered();
			const current = snapshot$.getValue();
			if (current.error) {
				const failed = Promise.reject(current.error);
				// A thrown rejection is handled by the boundary; nobody else need catch it.
				failed.catch(() => undefined);
				return failed;
			}
			if (current.ready) return Promise.resolve();
			return answer().promise;
		},
	};
}

/**
 * One handle per key per engine. A handle enters the registry when it STARTS (its first
 * reader), not when it is built: a render that acquires one and is then abandoned before its
 * effects run would otherwise leave an entry nobody can stop. Two renders that build the same
 * key before either commits reconcile at start, the second mirroring the first. A handle leaves
 * the registry when it stops (its last reader released and no successor subscribed within the
 * task), so the next reader of that key builds it afresh; while it lives, every reader shares it.
 */
const registries = new WeakMap<
	RxdbSyncEngine,
	Map<string, QueryHandle<QueryResult<RxCollection>>>
>();

/** What the registry tells a handle at start and stop. */
export type QueryHandleRegistration<R extends QueryResult<RxCollection>> = {
	/**
	 * Claim the key. Returns null when the handle now owns it (it was the owner, or the key was
	 * free), or the live handle that owns it, which the claimant then mirrors.
	 */
	claim(): QueryHandle<R> | null;
	/** Give the key up, if this handle holds it. */
	release(): void;
};

export function acquireQueryHandle<R extends QueryResult<RxCollection>>(
	engine: RxdbSyncEngine,
	key: string,
	create: (registry: QueryHandleRegistration<R>) => QueryHandle<R>
): QueryHandle<R> {
	let registry = registries.get(engine);
	if (!registry) {
		registry = new Map();
		registries.set(engine, registry);
	}
	const existing = registry.get(key);
	if (existing) return existing as QueryHandle<R>;
	const handle = create({
		claim() {
			const owner = registry.get(key);
			if (owner === undefined) {
				registry.set(key, handle as QueryHandle<QueryResult<RxCollection>>);
				return null;
			}
			return owner === handle ? null : (owner as QueryHandle<R>);
		},
		release() {
			if (registry.get(key) === handle) registry.delete(key);
		},
	});
	return handle;
}

/** For tests: how many handles an engine's registry holds. */
export function queryHandleCount(engine: RxdbSyncEngine): number {
	return registries.get(engine)?.size ?? 0;
}

/**
 * Every answered result, for a stream-shaped reader: it waits for the first engine answer
 * (`ready`), then tracks every result, and errors with a failed read. Subscribing retains the
 * handle as a reader; the subscriber unsubscribes when it is done.
 */
export function queryHandleResults$<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): Observable<R> {
	return handle.observe().pipe(
		switchMap((snapshot) => (snapshot.error ? throwError(() => snapshot.error) : of(snapshot))),
		// `ready: false` is "no answer yet": nothing is emitted for it.
		filter((snapshot) => snapshot.ready),
		map((snapshot) => snapshot.result),
		distinctUntilChanged()
	);
}

/**
 * Every answered result for as long as the subscription lasts. A failed read is skipped, not
 * thrown, so a side subscription derived from the rows (a demand for the records they
 * reference) survives the boundary's retry instead of closing on the failure for good.
 */
export function queryHandleAnswers$<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): Observable<R> {
	return handle.observe().pipe(
		filter((snapshot) => snapshot.ready && snapshot.error === null),
		map((snapshot) => snapshot.result),
		distinctUntilChanged()
	);
}
