import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import {
	BehaviorSubject,
	combineLatest,
	firstValueFrom,
	from,
	Observable,
	of,
	race,
	timer,
} from 'rxjs';
import {
	distinctUntilChanged,
	filter,
	map,
	shareReplay,
	startWith,
	switchMap,
} from 'rxjs/operators';

import {
	declareRequirements,
	engineCollectionNameFor,
	type EngineQueryDescriptor,
	LEGACY_SEARCH_FIELDS,
	observeCollectionActive,
	observeCoverage,
	observeEngineQuery,
	type QueryResult,
	useLocalQuery,
	useQueryRuntime,
} from '@wcpos/query';
import type {
	CensusTotals,
	CoverageOutcome,
	CoverageTarget,
	CoverageVerdict,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';
import type { RemoteId } from '@wcpos/sync-core';

import {
	compileQuery,
	requirementsForCompiledQuery,
	translateLogsQueryState,
} from './query-state-translator';

import type { CollectionKey, QueryStateOf } from './query-state-types';
import type { RxCollection } from 'rxdb';

type LegacyCollectionName = EngineQueryDescriptor['collection'];
type CompiledQuery = ReturnType<typeof compileQuery>;

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

export interface QueryBinding {
	resource: ObservableResource<QueryResult<RxCollection>>;
	result$: Observable<QueryResult<RxCollection>>;
	active$: Observable<boolean>;
	/**
	 * The size of the set this screen is about, or `null` when nothing can vouch for one.
	 *
	 * `null` is a real answer, not a missing one: it means neither a server count nor a claim
	 * of local completeness exists, so the only number available is "how many rows are loaded"
	 * — and printing THAT as a total is how the orders footer came to say "Showing 20 of 20"
	 * at a page size of 20, telling a cashier they had 20 orders when the next scroll found
	 * more. Consumers render a count without a denominator instead of inventing one.
	 */
	total$: Observable<number | null>;
	laneProgress$: Observable<QueryLaneProgress | null>;
	sync(): Promise<void>;
}

const DEMAND_RETRY_BACKOFF_MS = 250;
const NO_CENSUS_TOTAL$ = of(null as number | null);
const INACTIVE$ = of(false);
const NO_LANE_PROGRESS$ = of(null as QueryLaneProgress | null);

function useStableDescriptor(descriptor: EngineQueryDescriptor): EngineQueryDescriptor {
	const key = JSON.stringify({ ...descriptor, read: undefined });
	return React.useMemo(
		() => ({
			...(JSON.parse(key) as EngineQueryDescriptor),
			...(descriptor.read ? { read: descriptor.read } : {}),
		}),
		[key, descriptor.read]
	);
}

function useObservableResource<T>(observable$: Observable<T>): ObservableResource<T> {
	const [resource] = React.useState(() => new ObservableResource(observable$));
	React.useEffect(() => {
		// Reloading retains the current value while the new query loads and clears terminal errors.
		if (resource.input$ !== observable$) resource.reload(observable$);
	}, [observable$, resource]);
	React.useEffect(() => {
		// The resource owns the direct RxDB/db$ subscription for this binding.
		return () => resource.destroy();
	}, [resource]);
	return resource;
}

/**
 * What a settled demand declaration proves about the collection behind it.
 *
 * `attempted: false` is the `released` case of the CoverageOutcome contract: the requirement
 * was handed back without being met, because another engine instance (another tab) owns the
 * scheduler row or the claim was lost mid-drain. That other owner's pull is invisible to this
 * tab's activity counters, so a release must never be read as "the references landed" — the
 * caller has to keep waiting and re-declare rather than act on it.
 */
type DemandReadiness = { attempted: boolean };

const ATTEMPTED: DemandReadiness = { attempted: true };
const NOT_ATTEMPTED: DemandReadiness = { attempted: false };

function readinessFrom(outcomes: CoverageOutcome[]): DemandReadiness {
	return {
		attempted: outcomes.every((outcome) => outcome.action !== 'released'),
	};
}

/**
 * Which coverage key this binding's totals may be read from, or null when nothing the engine
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
 */
function coverageTargetFor(input: {
	collection: SyncCollectionName;
	handleQueryKey: string | null;
	represented: boolean;
	isUnfiltered: boolean;
}): CoverageTarget | null {
	if (!input.represented && !input.isUnfiltered) return null;
	if (input.handleQueryKey !== null) {
		return { collection: input.collection, queryKey: input.handleQueryKey };
	}
	return input.isUnfiltered ? { collection: input.collection, lane: 'reference' } : null;
}

type DemandProjection = {
	coverageTarget$: Observable<CoverageTarget | null>;
	/** Readiness of the STANDING declaration — the one the binding keeps alive while mounted. */
	whenReady(): Promise<DemandReadiness>;
	/** Declares the same requirements once more and releases them; the re-arm after a release. */
	declareOnce(signal?: AbortSignal): Promise<DemandReadiness>;
	/** Bumps whenever the engine resets coverage for this collection (re-declaration boundary). */
	generation: number;
	sync(): Promise<void>;
};

function useCoverageGeneration(engine: RxdbSyncEngine, collection: SyncCollectionName): number {
	const subscribe = React.useCallback(
		(notify: () => void) => engine.statusChanges(() => notify()),
		[engine]
	);
	const getSnapshot = React.useCallback(
		() => engine.status().collections[collection].coverageGeneration,
		[collection, engine]
	);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useDemand(
	engine: RxdbSyncEngine,
	id: string,
	descriptor: EngineQueryDescriptor,
	enabled: boolean,
	compiled: CompiledQuery
): DemandProjection {
	const coverageTarget$ = React.useMemo(
		() => new BehaviorSubject<CoverageTarget | null>(null),
		[engine, id]
	);
	const ready = React.useRef<Promise<DemandReadiness>>(Promise.resolve(ATTEMPTED));
	const demandKey = JSON.stringify(compiled.demand);
	const engineCollection = engineCollectionNameFor(descriptor.collection);
	const coverageGeneration = useCoverageGeneration(engine, engineCollection);

	React.useEffect(() => {
		if (!enabled) {
			coverageTarget$.next(null);
			ready.current = Promise.resolve(ATTEMPTED);
			return undefined;
		}
		const plan = {
			requirements: requirementsForCompiledQuery(compiled.demand, { id }),
			represented: compiled.represented,
		};
		const requirements = plan.requirements;
		let handles: RequirementHandle[] = [];
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let cancelled = false;
		// Unmount/descriptor-change settles any pending readiness barrier so whenReady()
		// callers (the coupon replay gate) never hang on an abandoned declaration.
		let settleOnCancel: (() => void) | undefined;
		const cancelBarrier = new Promise<void>((resolve) => {
			settleOnCancel = resolve;
		});
		const declare = (retryOnReject: boolean) => {
			if (cancelled) return;
			handles = declareRequirements(engine, requirements);
			const isUnfiltered =
				compiled.read.complete &&
				Object.keys(compiled.read.prefilter).length === 0 &&
				compiled.read.search === '';
			coverageTarget$.next(
				coverageTargetFor({
					collection: engineCollection,
					handleQueryKey: handles.find((handle) => handle.queryKey !== null)?.queryKey ?? null,
					represented: plan.represented,
					isUnfiltered,
				})
			);
			const settled = Promise.all(handles.map((handle) => handle.ready)).then(readinessFrom);
			// The readiness barrier must stay PENDING across the scheduled retry: settling
			// through the rejection would let whenReady() complete while nothing is in
			// flight yet, and the coupon barrier would read collections that are quiet only
			// because the retry has not started.
			ready.current = retryOnReject
				? settled.catch(
						() =>
							new Promise<DemandReadiness>((resolve) => {
								retryTimer = setTimeout(() => {
									if (cancelled) {
										resolve(NOT_ATTEMPTED);
										return;
									}
									releaseHandles(handles);
									declare(false);
									// declare(false) reassigned ready.current to the retried
									// declaration; chain this barrier to it.
									resolve(ready.current);
								}, DEMAND_RETRY_BACKOFF_MS);
								// An abandoned declaration proves nothing either — it unblocks
								// whenReady() without the requirement ever having been met.
								void cancelBarrier.then(() => resolve(NOT_ATTEMPTED));
							})
					)
				: settled;
			void ready.current.catch(() => undefined);
		};
		declare(true);
		return () => {
			cancelled = true;
			settleOnCancel?.();
			if (retryTimer !== undefined) clearTimeout(retryTimer);
			releaseHandles(handles);
		};
	}, [
		coverageGeneration,
		coverageTarget$,
		compiled,
		demandKey,
		descriptor.collection,
		enabled,
		engine,
		engineCollection,
		id,
	]);

	React.useEffect(
		() => () => {
			coverageTarget$.complete();
		},
		[coverageTarget$]
	);

	const sync = React.useCallback(async () => {
		if (!enabled) return;
		const requirements = requirementsForCompiledQuery(compiled.demand, {
			id: `${id}:sync`,
			priority: 1000,
			forceRefresh: true,
		});
		const handles = declareRequirements(engine, requirements);
		try {
			await Promise.all(handles.map((handle) => handle.ready.catch(() => undefined)));
			await engine.sync('scheduler-drain');
		} finally {
			releaseHandles(handles);
		}
	}, [compiled, enabled, engine, id]);

	/**
	 * Re-declare the standing requirements once and release them again.
	 *
	 * The standing declaration settles exactly once, so a caller that has to treat a
	 * `released` outcome as not-attempted cannot simply await `whenReady()` again — it would
	 * get the same already-settled release forever. This asks the engine afresh: once the
	 * owner that released us finishes, the same requirement comes back `serve-local` (inside
	 * the reference dedupe window) or `fetched`.
	 */
	const declareOnce = React.useCallback(
		async (signal?: AbortSignal): Promise<DemandReadiness> => {
			if (!enabled) return ATTEMPTED;
			if (signal?.aborted) return NOT_ATTEMPTED;
			const requirements = requirementsForCompiledQuery(compiled.demand, {
				id: `${id}:rearm`,
			});
			const handles = declareRequirements(engine, requirements);
			// `release()` IS the engine's cancellation verb — it aborts queued or in-flight
			// foreground work and settles `ready` as `released`. Without this an aborted caller
			// would keep waiting on (and holding) a declaration nobody wants any more.
			const abortHandler = () => releaseHandles(handles);
			signal?.addEventListener('abort', abortHandler, { once: true });
			try {
				return readinessFrom(await Promise.all(handles.map((handle) => handle.ready)));
			} catch {
				return NOT_ATTEMPTED;
			} finally {
				signal?.removeEventListener('abort', abortHandler);
				releaseHandles(handles);
			}
		},
		[compiled, enabled, engine, id]
	);

	const whenReady = React.useCallback(() => ready.current.catch(() => NOT_ATTEMPTED), []);
	return { coverageTarget$, sync, whenReady, declareOnce, generation: coverageGeneration };
}

/** The engine declining to vouch — what a binding with no coverage target reports. */
const UNKNOWN_COVERAGE: CoverageVerdict = {
	total: null,
	source: 'unknown',
	complete: false,
	fresh: false,
	progress: null,
};
const UNKNOWN_COVERAGE$ = of(UNKNOWN_COVERAGE);

/**
 * Identity of a coverage target, so that a RE-declaration naming the same target does not
 * resubscribe the verdict. Every declare pushes a freshly built object; without this the
 * switchMap below would tear the subscription down and republish `unknown`, blinking the
 * footer back to the resident count on every re-declare.
 */
function coverageTargetKey(target: CoverageTarget | null): string {
	if (target === null) return '';
	return 'queryKey' in target
		? `${target.collection}::${target.queryKey}`
		: `${target.collection}::@reference`;
}

/**
 * The engine's whole-collection census total — the same number the Store Health › Database
 * page shows. `null` until the engine has recorded a census answer for the collection.
 */
function censusTotal$(
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
 * The footer's numbers, composed from the engine's verdict, the collection census, and this
 * binding's own resident count — one source of truth, so the footer and the Store Health ›
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
 */
function coverageProjection$(
	engine: RxdbSyncEngine,
	result$: Observable<QueryResult<RxCollection>>,
	coverageTarget$: Observable<CoverageTarget | null>,
	census$: Observable<number | null>
): Observable<{ total: number | null; laneProgress: QueryLaneProgress | null }> {
	const verdict$ = coverageTarget$.pipe(
		distinctUntilChanged(
			(previous, current) => coverageTargetKey(previous) === coverageTargetKey(current)
		),
		switchMap((target) => (target === null ? UNKNOWN_COVERAGE$ : observeCoverage(engine, target)))
	);
	return combineLatest([
		result$.pipe(map((result) => result.count ?? result.hits.length)),
		verdict$,
		census$,
	]).pipe(
		map(([localCount, verdict, censusTotal]) => {
			// `censusTotal` is non-null only where the census honestly stands for this screen
			// (see `censusScoped`) and has landed.
			const serverTotal = censusTotal ?? verdict.total;
			if (serverTotal !== null) {
				return { total: Math.max(serverTotal, localCount), laneProgress: verdict.progress };
			}
			// No server count anywhere. The resident count is a truthful TOTAL only when the
			// engine claims to hold the whole matching set — `complete` is exactly that claim,
			// and a windowed browse lane deliberately never makes it (coverage-verdicts.ts).
			// Otherwise the resident count is just "what has loaded so far", and passing it off
			// as the size of the set is the "Showing 20 of 20" lie.
			return {
				total: verdict.complete ? localCount : null,
				laneProgress: verdict.progress,
			};
		}),
		distinctUntilChanged(
			(previous, current) =>
				previous.total === current.total &&
				previous.laneProgress?.downloaded === current.laneProgress?.downloaded &&
				previous.laneProgress?.total === current.laneProgress?.total
		),
		shareReplay({ bufferSize: 1, refCount: true })
	);
}

function searchFieldsFor(collection: LegacyCollectionName): string[] | undefined {
	const fields = LEGACY_SEARCH_FIELDS[collection as keyof typeof LEGACY_SEARCH_FIELDS];
	return fields ? [...fields] : undefined;
}

function emptyResult(): QueryResult<RxCollection> {
	return { searchActive: false, count: 0, hits: [] };
}

export function useLogsBinding(state: QueryStateOf<'logs'>): QueryBinding {
	const translated = translateLogsQueryState(state);
	const local = useLocalQuery({
		collectionName: 'logs',
		selector: translated.selector,
		sort: translated.sort,
		limit: translated.limit,
		search: translated.search,
	});
	return {
		resource: local.resource as unknown as ObservableResource<QueryResult<RxCollection>>,
		result$: local.result$ as unknown as Observable<QueryResult<RxCollection>>,
		total$: local.total$,
		laneProgress$: NO_LANE_PROGRESS$,
		active$: INACTIVE$,
		sync: async () => undefined,
	};
}

function useEngineBinding(
	descriptorInput: EngineQueryDescriptor,
	compiled: CompiledQuery,
	enabled = true,
	compiledId?: string
): QueryBinding & {
	result$: Observable<QueryResult<RxCollection>>;
	whenReady(): Promise<DemandReadiness>;
	declareOnce(signal?: AbortSignal): Promise<DemandReadiness>;
	generation: number;
} {
	const runtime = useQueryRuntime();
	const generatedId = React.useId();
	const bindingId = compiledId ?? generatedId;
	const searchFields = searchFieldsFor(descriptorInput.collection);
	const searchFieldsKey = JSON.stringify(searchFields);
	const read = React.useMemo(
		() => (descriptorInput.read ? { ...descriptorInput.read, searchFields } : undefined),
		[descriptorInput.read, searchFieldsKey]
	);
	const descriptor = useStableDescriptor({
		...descriptorInput,
		searchFields,
		read,
	});
	const demand = useDemand(runtime.engine, bindingId, descriptor, enabled, compiled);
	const active$ = React.useMemo(
		() =>
			enabled
				? observeCollectionActive(
						runtime.engine,
						engineCollectionNameFor(descriptor.collection)
					).pipe(shareReplay({ bufferSize: 1, refCount: true }))
				: INACTIVE$,
		[descriptor.collection, enabled, runtime.engine]
	);
	const result$ = React.useMemo(() => {
		if (!enabled) return of(emptyResult());
		return observeEngineQuery(runtime.engine, runtime.locale, descriptor).pipe(
			map((result) => ({
				...result,
				searchActive: Boolean((descriptor.read?.search ?? descriptor.search)?.trim()),
			})),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}, [descriptor, enabled, runtime.engine, runtime.locale]);
	const census$ = React.useMemo(
		() =>
			compiled.censusScoped
				? censusTotal$(runtime.engine, engineCollectionNameFor(descriptor.collection))
				: NO_CENSUS_TOTAL$,
		[compiled.censusScoped, descriptor.collection, runtime.engine]
	);
	const projection$ = React.useMemo(
		() => coverageProjection$(runtime.engine, result$, demand.coverageTarget$, census$),
		[census$, demand.coverageTarget$, result$, runtime.engine]
	);
	const resource = useObservableResource(result$);
	const total$ = React.useMemo(() => projection$.pipe(map(({ total }) => total)), [projection$]);
	const laneProgress$ = React.useMemo(
		() => projection$.pipe(map(({ laneProgress }) => laneProgress)),
		[projection$]
	);
	// Memoised for the same reason as the projections above: consumers hold the binding and
	// compare it, so a fresh object per render is churn they cannot memoise away.
	return React.useMemo(
		() => ({
			resource,
			result$,
			active$,
			total$,
			laneProgress$,
			sync: demand.sync,
			whenReady: demand.whenReady,
			declareOnce: demand.declareOnce,
			generation: demand.generation,
		}),
		[resource, result$, active$, total$, laneProgress$, demand]
	);
}

export function useCollectionBinding<C extends Exclude<CollectionKey, 'logs'>>(
	collection: C,
	state: QueryStateOf<C>,
	options: { remoteIds?: readonly RemoteId[] } = {}
): QueryBinding {
	const bindingId = React.useId();
	const searchFields = searchFieldsFor(
		(collection === 'tax-rates' ? 'taxes' : collection) as LegacyCollectionName
	);
	const compileKey = JSON.stringify([collection, state, options.remoteIds, searchFields]);
	const compiled = React.useMemo(
		() =>
			compileQuery(collection, state, {
				id: bindingId,
				targeted: options.remoteIds,
				searchFields,
			}),
		[compileKey, bindingId]
	);
	const engineDescriptor: EngineQueryDescriptor = {
		collection: compiled.collection,
		read: compiled.read,
	};
	return useEngineBinding(engineDescriptor, compiled, true, bindingId);
}

function releaseHandles(handles: RequirementHandle[]): void {
	for (const handle of handles) handle.release();
}

function observeParentLookup(
	engine: RxdbSyncEngine,
	locale: string,
	id: string,
	parentIds: number[],
	searchFields: string[] | undefined
): Observable<QueryResult<RxCollection>> {
	if (parentIds.length === 0) return of(emptyResult());
	return new Observable<QueryResult<RxCollection>>((subscriber) => {
		const descriptor: EngineQueryDescriptor = {
			collection: 'products',
			selector: { id: { $in: parentIds } },
			searchFields,
		};
		const compiled = compileQuery(
			'products',
			{
				search: '',
				filters: { categories: [], brands: [], tags: [] },
				sort: { field: 'id', direction: 'asc' },
			},
			{ id, targeted: parentIds, searchFields }
		);
		const requirements = requirementsForCompiledQuery(compiled.demand, { id });
		const handles = declareRequirements(engine, requirements);
		const subscription = observeEngineQuery(engine, locale, descriptor).subscribe(subscriber);
		return () => {
			subscription.unsubscribe();
			releaseHandles(handles);
		};
	});
}

export function useRelationalCollectionBinding(state: QueryStateOf<'products'>): QueryBinding {
	const runtime = useQueryRuntime();
	const bindingId = React.useId();
	const parentSearchFields = searchFieldsFor('products');
	const compileKey = JSON.stringify([state, parentSearchFields]);
	const compiled = React.useMemo(
		() =>
			compileQuery('products', state, {
				id: `${bindingId}:parent`,
				searchFields: parentSearchFields,
			}),
		[bindingId, compileKey]
	);
	const descriptor = useStableDescriptor({
		collection: 'products',
		read: compiled.read,
		searchFields: parentSearchFields,
	});
	const childDescriptor = useStableDescriptor({
		collection: 'variations',
		selector: state.filters.status ? { status: state.filters.status } : {},
		sort: [{ id: 'asc' }],
		search: compiled.read.search,
		searchFields: searchFieldsFor('variations'),
	});
	const childCompiled = React.useMemo(
		() =>
			compileQuery(
				'variations',
				{
					search: compiled.read.search,
					filters: {
						attributeMatches: [],
						...(state.filters.status ? { status: state.filters.status } : {}),
					},
					sort: { field: 'id', direction: 'asc' },
				},
				{ id: `${bindingId}:child`, searchFields: childDescriptor.searchFields }
			),
		[bindingId, childDescriptor.searchFields, compiled.read.search, state.filters.status]
	);
	const parentDemand = useDemand(runtime.engine, `${bindingId}:parent`, descriptor, true, compiled);
	const childDemand = useDemand(
		runtime.engine,
		`${bindingId}:child`,
		childDescriptor,
		Boolean(compiled.read.search),
		childCompiled
	);
	const result$ = React.useMemo(() => {
		if (!compiled.read.search) {
			return observeEngineQuery(runtime.engine, runtime.locale, descriptor).pipe(
				shareReplay({ bufferSize: 1, refCount: true })
			);
		}
		const direct$ = observeEngineQuery(runtime.engine, runtime.locale, {
			...descriptor,
			read: { ...compiled.read, limit: undefined },
		});
		const children$ = observeEngineQuery(runtime.engine, runtime.locale, childDescriptor);
		return combineLatest([direct$, children$]).pipe(
			switchMap(([direct, children]) => {
				const counts = new Map<number, number>();
				for (const hit of children.hits) {
					const parentId = Number(hit.record.payload.parent_id);
					if (Number.isFinite(parentId)) counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
				}
				const parentIds = [...counts.keys()];
				return observeParentLookup(
					runtime.engine,
					runtime.locale,
					`${bindingId}:lookup`,
					parentIds,
					descriptor.searchFields
				).pipe(map((lookup) => ({ direct, lookup, counts })));
			}),
			switchMap(({ direct, lookup, counts }) => {
				const uuids = [...new Set([...direct.hits, ...lookup.hits].map((hit) => hit.id))];
				return observeEngineQuery(runtime.engine, runtime.locale, {
					...descriptor,
					read: { ...compiled.read, search: '' },
					selector: { uuid: { $in: uuids } },
				}).pipe(
					map((result) => ({
						...result,
						searchActive: Boolean(compiled.read.search),
						hits: result.hits.map((hit) => {
							const wooId = Number(hit.record.payload.id);
							return {
								...hit,
								childrenSearchCount: counts.get(wooId) ?? 0,
								parentSearchTerm: compiled.read.search,
							};
						}),
					}))
				);
			}),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}, [bindingId, childDescriptor, compiled.read, descriptor, runtime.engine, runtime.locale]);
	const resource = useObservableResource(result$);
	const census$ = React.useMemo(
		() => (compiled.censusScoped ? censusTotal$(runtime.engine, 'products') : NO_CENSUS_TOTAL$),
		[compiled.censusScoped, runtime.engine]
	);
	const projection$ = React.useMemo(
		() => coverageProjection$(runtime.engine, result$, parentDemand.coverageTarget$, census$),
		[census$, parentDemand.coverageTarget$, result$, runtime.engine]
	);
	const active$ = React.useMemo(
		() =>
			combineLatest([
				observeCollectionActive(runtime.engine, 'products'),
				observeCollectionActive(runtime.engine, 'variations'),
			]).pipe(
				map((values) => values.some(Boolean)),
				distinctUntilChanged(),
				shareReplay({ bufferSize: 1, refCount: true })
			),
		[runtime.engine]
	);
	const sync = React.useCallback(
		() => Promise.all([parentDemand.sync(), childDemand.sync()]).then(() => undefined),
		[childDemand, parentDemand]
	);

	/**
	 * Memoised, like `resource` and `active$` above and like every projection in
	 * `useEngineBinding`. These three were piped inline in the return, so each render handed
	 * consumers three NEW observables.
	 *
	 * That is not merely wasteful. `useObservableState` keys its subscription on observable
	 * identity, so the footer resubscribed on every render; `projection$` carries
	 * `shareReplay({ bufferSize: 1 })`, so each resubscribe immediately replayed its buffered
	 * value and set state again. A single cart write therefore rang through the products
	 * panel several times over before settling — measured at `POSProductsContent` ×4,
	 * `ProductTile` ×80 per add or remove.
	 *
	 * `useEngineBinding` already memoises the same three projections; this hook is the one
	 * the POS products panel uses, and it did not.
	 */
	const total$ = React.useMemo(() => projection$.pipe(map(({ total }) => total)), [projection$]);
	const laneProgress$ = React.useMemo(
		() => projection$.pipe(map(({ laneProgress }) => laneProgress)),
		[projection$]
	);

	return React.useMemo(
		() => ({ resource, result$, active$, total$, laneProgress$, sync }),
		[resource, result$, active$, total$, laneProgress$, sync]
	);
}

export type SearchSelectCollection =
	'customer' | 'category' | 'brand' | 'tag' | 'cashier' | 'coupon';

const SEARCH_SELECT_LIMIT = 50;
const SEARCH_SELECT_LIMIT_MAX = 100;

function searchSelectDescriptor(
	collection: SearchSelectCollection,
	search: string,
	limit: number
): EngineQueryDescriptor {
	const isCustomer = collection === 'customer' || collection === 'cashier';
	const names: Record<SearchSelectCollection, LegacyCollectionName> = {
		customer: 'customers',
		cashier: 'customers',
		category: 'products/categories',
		brand: 'products/brands',
		tag: 'products/tags',
		coupon: 'coupons',
	};
	return {
		collection: names[collection],
		selector:
			collection === 'cashier'
				? { role: { $in: ['administrator', 'shop_manager', 'cashier'] } }
				: {},
		sort: [
			{
				[isCustomer ? 'last_name' : collection === 'coupon' ? 'code' : 'name']: 'asc',
			},
		],
		limit,
		search,
	};
}

export function useSearchSelect(
	collection: SearchSelectCollection,
	options: { debounceMs?: number; maxResults?: number } = {}
) {
	const [search, setSearch] = React.useState('');
	const [committedSearch, setCommittedSearch] = React.useState('');
	const debounceMs = options.debounceMs ?? 150;
	React.useEffect(() => {
		// Input text is intentionally the only debounced state; query state remains committed.
		const timerId = setTimeout(() => setCommittedSearch(search.trim()), debounceMs);
		return () => clearTimeout(timerId);
	}, [debounceMs, search]);
	const limit = Math.max(
		1,
		Math.min(options.maxResults ?? SEARCH_SELECT_LIMIT, SEARCH_SELECT_LIMIT_MAX)
	);
	const bindingId = React.useId();
	const compiled = React.useMemo(() => {
		const common = { search: committedSearch, filters: {}, limit } as const;
		switch (collection) {
			case 'customer':
			case 'cashier':
				return compileQuery(
					'customers',
					{ ...common, sort: { field: 'last_name', direction: 'asc' } },
					{ id: bindingId, residual: collection === 'cashier' }
				);
			case 'category':
				return compileQuery(
					'products/categories',
					{ ...common, sort: { field: 'name', direction: 'asc' } },
					{ id: bindingId }
				);
			case 'brand':
				return compileQuery(
					'products/brands',
					{ ...common, sort: { field: 'name', direction: 'asc' } },
					{ id: bindingId }
				);
			case 'tag':
				return compileQuery(
					'products/tags',
					{ ...common, sort: { field: 'name', direction: 'asc' } },
					{ id: bindingId }
				);
			case 'coupon':
				return compileQuery(
					'coupons',
					{ ...common, sort: { field: 'code', direction: 'asc' } },
					{ id: bindingId }
				);
		}
	}, [bindingId, collection, committedSearch, limit]);
	const binding = useEngineBinding(
		searchSelectDescriptor(collection, committedSearch, limit),
		compiled,
		true,
		bindingId
	);
	return { ...binding, search, setSearch, committedSearch };
}

/** Full reference-lane category residents for the hierarchical category tree. */
export function useAllCategoriesBinding() {
	const bindingId = React.useId();
	const compiled = React.useMemo(
		() =>
			compileQuery(
				'products/categories',
				{
					search: '',
					filters: {},
					sort: { field: 'name', direction: 'asc' },
				},
				{ id: bindingId }
			),
		[bindingId]
	);
	return useEngineBinding(
		{
			collection: 'products/categories',
			selector: {},
			sort: [{ name: 'asc' }],
		},
		compiled,
		true,
		bindingId
	);
}

/** How long the coupon replay waits for its reference pull before giving up on it. */
const COUPON_REFERENCE_SETTLE_TIMEOUT_MS = 10_000;

/**
 * How long the OFF-CRITICAL-PATH continuation keeps waiting after the foreground barrier
 * expired (#963). Generous, because nothing is blocked on it — but not forever: a wedged lane
 * must not leave a timer and a captured order document alive for the life of the session. The
 * next cart edit remains the ultimate self-heal.
 */
const COUPON_REFERENCE_BACKGROUND_TIMEOUT_MS = 3 * 60_000;
const COUPON_REFERENCE_REARM_BASE_MS = 500;
const COUPON_REFERENCE_REARM_MAX_MS = 10_000;

/** Emits `false` once the caller aborts; never completes otherwise (safe inside `race`). */
function whenAborted$(signal: AbortSignal): Observable<boolean> {
	return new Observable<boolean>((subscriber) => {
		const abort = () => {
			subscriber.next(false);
			subscriber.complete();
		};
		if (signal.aborted) {
			abort();
			return undefined;
		}
		signal.addEventListener('abort', abort);
		return () => signal.removeEventListener('abort', abort);
	});
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		const abort = () => {
			clearTimeout(timerId);
			resolve();
		};
		const timerId = setTimeout(() => {
			signal.removeEventListener('abort', abort);
			resolve();
		}, ms);
		signal.addEventListener('abort', abort, { once: true });
	});
}

/**
 * Resolve `fallback` if the caller aborts or the deadline passes before `promise` settles.
 *
 * The STANDING readiness promise has no deadline of its own and no cancellation — it is owned by
 * the demand effect. A continuation that awaited it bare would hold its closure (and the order
 * document it captured) until the demand happened to settle, ignoring both its own abort and its
 * own cap. This bounds the wait without pretending the underlying work stopped.
 */
function withDeadline<T>(
	promise: Promise<T>,
	signal: AbortSignal,
	deadline: number,
	fallback: T
): Promise<T> {
	return new Promise<T>((resolve) => {
		let done = false;
		const finish = (value: T) => {
			if (done) return;
			done = true;
			clearTimeout(timerId);
			signal.removeEventListener('abort', onAbort);
			resolve(value);
		};
		const onAbort = () => finish(fallback);
		const timerId = setTimeout(() => finish(fallback), Math.max(0, deadline - Date.now()));
		if (signal.aborted) {
			finish(fallback);
			return;
		}
		signal.addEventListener('abort', onAbort, { once: true });
		void promise.then(
			(value) => finish(value),
			() => finish(fallback)
		);
	});
}

const COUPON_REPLAY_COUPONS_DESCRIPTOR: EngineQueryDescriptor = {
	collection: 'coupons',
	selector: {},
	sort: [{ code: 'asc' }],
};

const COUPON_REPLAY_CATEGORIES_DESCRIPTOR: EngineQueryDescriptor = {
	collection: 'products/categories',
	selector: {},
	sort: [{ name: 'asc' }],
};

const COUPON_REPLAY_COUPONS_COMPILED = compileQuery(
	'coupons',
	{
		search: '',
		filters: {},
		sort: { field: 'code', direction: 'asc' },
	},
	{ id: 'coupon-replay:coupons' }
);

const COUPON_REPLAY_CATEGORIES_COMPILED = compileQuery(
	'products/categories',
	{
		search: '',
		filters: {},
		sort: { field: 'name', direction: 'asc' },
	},
	{ id: 'coupon-replay:categories' }
);

/**
 * Reference demand for replaying coupons already applied to the cart (#952).
 *
 * The coupon picker declares its own demand when it mounts, but coupon *replay*
 * does not go through a query at all: `useRecalculateCoupons` scans the resident
 * coupons collection for each applied code (throwing when one is missing) and the
 * resident categories collection to enrich product categories with their ancestors,
 * the way `wc_get_product_cat_ids()` does. Both scans are invisible to the
 * requirement bridge.
 *
 * Before #952 those collections were greedily seeded at boot, so the scans always
 * found their data. Now that reference lanes are on demand, a cart carrying coupon
 * lines has to declare that demand itself — otherwise re-opening an order with a
 * coupon on a device that never opened the picker fails to recalculate, and
 * category-restricted coupons silently mis-validate against an empty tree.
 *
 * Declared only while coupon lines are present, and collapsed by the engine's
 * existing `REFERENCE_REFRESH_DEDUPE_MS` window, so a coupon cart costs at most one
 * refresh per collection per dedupe window rather than a pull per cart edit.
 *
 * Declaring the demand is not enough on its own: it is asynchronous, and the replay is
 * driven by a cart edit that can land while the pull is still in flight. So this also
 * returns `whenSettled()`, the barrier the replay awaits before it scans — without it a
 * cashier who re-opens a coupon order and immediately changes a quantity still scans the
 * empty collections, which is the exact failure the demand exists to prevent.
 *
 * `whenSettled()` resolves `false` when the wait timed out rather than the pull settling.
 * The caller must NOT scan on `false`: the barrier's whole point is that the residents are
 * not trustworthy yet, and a deadline does not make them trustworthy. Bail instead — the
 * next cart edit re-runs the replay, by which time the pull has almost certainly landed.
 * Readiness is awaited before quietness so another owner's in-flight pull cannot be mistaken
 * for completion when these handles resolve `released` after a skipped-active declaration.
 *
 * `whenSettledInBackground(signal)` is the continuation for that `false` (#963): the same wait,
 * moved off the critical path so a pull that outran the foreground deadline still ends in a
 * replay instead of stranding the cashier on stale totals until the next edit. It differs from
 * the foreground barrier in exactly two ways — it is capped minutes rather than seconds, and it
 * reads the CoverageOutcome contract strictly. Ready-then-quiet is safe same-tab but not
 * cross-tab: a refresh handle can resolve `released` because ANOTHER tab owns the scheduler row,
 * and that tab's in-flight pull is invisible to this tab's activity counters, so the collections
 * go quiet while they are still empty. A release is therefore NOT-attempted here — the wait
 * re-declares after a backoff instead of firing on it.
 */
export function useAppliedCouponReferenceDemand(hasAppliedCoupons: boolean): {
	whenSettled: () => Promise<boolean>;
	whenSettledInBackground: (signal: AbortSignal) => Promise<boolean>;
	generation: number;
} {
	const coupons = useEngineBinding(
		COUPON_REPLAY_COUPONS_DESCRIPTOR,
		COUPON_REPLAY_COUPONS_COMPILED,
		hasAppliedCoupons
	);
	const categories = useEngineBinding(
		COUPON_REPLAY_CATEGORIES_DESCRIPTOR,
		COUPON_REPLAY_CATEGORIES_COMPILED,
		hasAppliedCoupons
	);
	const quiet$ = React.useMemo(
		() =>
			combineLatest([coupons.active$, categories.active$]).pipe(
				map(([couponsActive, categoriesActive]) => !couponsActive && !categoriesActive),
				filter(Boolean)
			),
		[categories.active$, coupons.active$]
	);
	return React.useMemo(
		() => ({
			// Bounded: cart math must never hang on sync, so the wait cannot be open-ended. The
			// deadline reports itself (`false`) instead of pretending the pull landed.
			whenSettled: () =>
				firstValueFrom(
					race(
						from(
							Promise.all([coupons.whenReady(), categories.whenReady()]).then(() =>
								firstValueFrom(quiet$)
							)
						).pipe(map(() => true)),
						timer(COUPON_REFERENCE_SETTLE_TIMEOUT_MS).pipe(map(() => false))
					)
				),
			whenSettledInBackground: async (signal: AbortSignal): Promise<boolean> => {
				const deadline = Date.now() + COUPON_REFERENCE_BACKGROUND_TIMEOUT_MS;
				// First pass rides the STANDING declaration — the very pull the foreground gave
				// up on. `whenReady()` reads the live ref, so a re-declaration is picked up too.
				// Bounded, because that promise answers to neither this abort nor this cap.
				let readiness = await withDeadline(
					Promise.all([coupons.whenReady(), categories.whenReady()]),
					signal,
					deadline,
					[NOT_ATTEMPTED, NOT_ATTEMPTED]
				);
				for (let attempt = 0; !signal.aborted && Date.now() < deadline; attempt += 1) {
					if (readiness.every(({ attempted }) => attempted)) {
						const remaining = deadline - Date.now();
						if (remaining <= 0) break;
						// Ready-then-quiet, same ordering as the foreground barrier: readiness is
						// proven for this tab, quietness rules out a sibling declaration still writing.
						return await firstValueFrom(
							race(
								quiet$.pipe(map(() => true)),
								timer(remaining).pipe(map(() => false)),
								whenAborted$(signal)
							)
						);
					}
					// `released` (or an abandoned declaration) proves nothing: another owner holds
					// the scheduler row and its pull is invisible here. Ask again after a backoff
					// rather than reading the release as a settle.
					await sleep(
						Math.min(COUPON_REFERENCE_REARM_BASE_MS * 2 ** attempt, COUPON_REFERENCE_REARM_MAX_MS),
						signal
					);
					if (signal.aborted || Date.now() >= deadline) break;
					const rearm = new AbortController();
					try {
						readiness = await withDeadline(
							Promise.all([
								coupons.declareOnce(rearm.signal),
								categories.declareOnce(rearm.signal),
							]),
							signal,
							deadline,
							[NOT_ATTEMPTED, NOT_ATTEMPTED]
						);
					} finally {
						rearm.abort();
					}
				}
				return false;
			},
			generation: coupons.generation + categories.generation,
		}),
		[categories, coupons, quiet$]
	);
}
