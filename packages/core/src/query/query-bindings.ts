import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import {
	BehaviorSubject,
	combineLatest,
	EMPTY,
	firstValueFrom,
	from,
	Observable,
	of,
	race,
	timer,
} from 'rxjs';
import {
	distinctUntilChanged,
	expand,
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
	observeCollectionActive,
	observeEngineDatabases,
	observeEngineQuery,
	type QueryResult,
	requirementsForQuery,
	type RequirementSortPart,
	useLocalQuery,
	useQueryRuntime,
} from '@wcpos/query';
import type {
	CoverageLaneDocument,
	QueryTotalCacheDocument,
	RequirementHandle,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';

import { translateQueryState } from './query-state-translator';

import type { CollectionKey, QueryStateOf } from './query-state-types';
import type { MangoQuerySortPart, RxCollection, RxDatabase, RxDocument } from 'rxdb';

type LegacyCollectionName = EngineQueryDescriptor['collection'];
type TotalSource = 'coverage' | 'local';

export interface QueryBinding {
	resource: ObservableResource<QueryResult<RxCollection>>;
	result$: Observable<QueryResult<RxCollection>>;
	active$: Observable<boolean>;
	total$: Observable<number>;
	totalSource$: Observable<TotalSource>;
	sync(): Promise<void>;
}

const COMPLETE_COLLECTION_LANES: Partial<Record<LegacyCollectionName, string>> = {
	taxes: 'taxRates:all',
	'products/categories': 'categories:all',
	'products/tags': 'tags:all',
	'products/brands': 'brands:all',
	coupons: 'coupons:all',
};

const DEMAND_RETRY_BACKOFF_MS = 250;
const LOCAL_TOTAL_SOURCE$ = of('local' as const);
const INACTIVE$ = of(false);

function stableDescriptor(descriptor: EngineQueryDescriptor): EngineQueryDescriptor {
	return descriptor;
}

function useStableDescriptor(descriptor: EngineQueryDescriptor): EngineQueryDescriptor {
	const key = JSON.stringify(descriptor);
	return React.useMemo(() => stableDescriptor(JSON.parse(key) as EngineQueryDescriptor), [key]);
}

function selectorWithSearch(descriptor: EngineQueryDescriptor): Record<string, unknown> {
	const selector = { ...(descriptor.selector ?? {}) } as Record<string, unknown>;
	const search = descriptor.search?.trim();
	if (search) selector.search = search;
	return selector;
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

type DemandProjection = {
	queryKey$: Observable<string | null>;
	whenReady(): Promise<void>;
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
	enabled: boolean
): DemandProjection {
	const queryKey$ = React.useMemo(() => new BehaviorSubject<string | null>(null), [engine, id]);
	const ready = React.useRef<Promise<void>>(Promise.resolve());
	const selector = selectorWithSearch(descriptor);
	const selectorKey = JSON.stringify(selector);
	// The products browse window travels with the grid's sort (#909), so the sort is part
	// of what the demand effect depends on — a serialized key keeps the array identity out.
	const sortKey = JSON.stringify(descriptor.sort ?? []);
	const engineCollection = engineCollectionNameFor(descriptor.collection);
	const coverageGeneration = useCoverageGeneration(engine, engineCollection);

	React.useEffect(() => {
		if (!enabled) {
			queryKey$.next(null);
			ready.current = Promise.resolve();
			return undefined;
		}
		const stableSelector = JSON.parse(selectorKey) as Record<string, unknown>;
		const binding = {
			id,
			collectionName: descriptor.collection,
			selector: stableSelector,
			limit: descriptor.limit,
			sort: JSON.parse(sortKey) as RequirementSortPart[],
		};
		const plan = requirementsForQuery(binding);
		const requirements = plan.requirements;
		let handles: RequirementHandle[] = [];
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let cancelled = false;
		const declare = (retryOnReject: boolean) => {
			if (cancelled) return;
			handles = declareRequirements(engine, requirements);
			const browseIndex = requirements.findIndex(
				(requirement) =>
					requirement.kind === 'orders-browse' || requirement.kind === 'product-browse'
			);
			const fixedKey =
				Object.keys(stableSelector).length === 0
					? (COMPLETE_COLLECTION_LANES[descriptor.collection] ?? null)
					: null;
			queryKey$.next(plan.represented ? (handles[browseIndex]?.queryKey ?? fixedKey) : fixedKey);
			ready.current = Promise.all(handles.map((handle) => handle.ready)).then(() => undefined);
			void ready.current.catch(() => {
				if (!retryOnReject || cancelled) return;
				retryTimer = setTimeout(() => {
					if (cancelled) return;
					releaseHandles(handles);
					declare(false);
				}, DEMAND_RETRY_BACKOFF_MS);
			});
		};
		declare(true);
		return () => {
			cancelled = true;
			if (retryTimer !== undefined) clearTimeout(retryTimer);
			releaseHandles(handles);
		};
	}, [
		coverageGeneration,
		descriptor.collection,
		descriptor.limit,
		descriptor.search,
		enabled,
		engine,
		id,
		queryKey$,
		selectorKey,
		sortKey,
	]);

	React.useEffect(
		() => () => {
			queryKey$.complete();
		},
		[queryKey$]
	);

	const sync = React.useCallback(async () => {
		if (!enabled) return;
		const requirements = requirementsForQuery({
			id: `${id}:sync`,
			collectionName: descriptor.collection,
			selector: selectorWithSearch(descriptor),
			limit: descriptor.limit,
			sort: descriptor.sort as RequirementSortPart[] | undefined,
			priority: 1000,
			forceRefresh: true,
		}).requirements;
		const handles = declareRequirements(engine, requirements);
		try {
			await Promise.all(handles.map((handle) => handle.ready.catch(() => undefined)));
			await engine.sync('scheduler-drain');
		} finally {
			releaseHandles(handles);
		}
	}, [descriptor, enabled, engine, id]);

	const whenReady = React.useCallback(() => ready.current.catch(() => undefined), []);
	return { queryKey$, sync, whenReady };
}

function coverageFreshnessTicks(
	lanes: CoverageLaneDocument[],
	queryTotals: QueryTotalCacheDocument[]
): Observable<number> {
	const expiries = [...lanes, ...queryTotals].map(({ freshUntilMs }) => freshUntilMs);
	return of(Date.now()).pipe(
		expand((nowMs) => {
			const nextExpiry = expiries.reduce<number | undefined>(
				(next, expiry) => (expiry > nowMs && (next === undefined || expiry < next) ? expiry : next),
				undefined
			);
			return nextExpiry === undefined
				? EMPTY
				: timer(Math.max(0, nextExpiry - nowMs + 1)).pipe(map(() => Date.now()));
		})
	);
}

function projectTotal(input: {
	localCount: number;
	queryKey: string | null;
	lanes: CoverageLaneDocument[];
	queryTotals: QueryTotalCacheDocument[];
	nowMs: number;
}): { total: number; source: TotalSource } {
	if (input.queryKey === null) return { total: input.localCount, source: 'local' };
	const queryTotal = input.queryTotals.find(
		(candidate) => candidate.queryKey === input.queryKey && candidate.freshUntilMs > input.nowMs
	);
	if (queryTotal) return { total: queryTotal.totalMatchingRecords, source: 'coverage' };
	const lane = input.lanes.find(
		(candidate) =>
			candidate.queryKey === input.queryKey &&
			candidate.complete &&
			candidate.freshUntilMs > input.nowMs
	);
	return lane
		? { total: lane.expectedRecordIds.length, source: 'coverage' }
		: { total: input.localCount, source: 'local' };
}

function coverageDocuments$<T>(
	database$: Observable<RxDatabase | null>,
	collectionName: string
): Observable<T[]> {
	return database$.pipe(
		switchMap((database) => {
			const collection = database?.collections[collectionName] as RxCollection<T> | undefined;
			if (!collection) return of([] as T[]);
			return collection.find().$.pipe(
				map((documents: RxDocument<T>[]) =>
					documents.map((document) => document.toJSON() as unknown as T)
				),
				startWith([] as T[])
			);
		})
	);
}

function coverageProjection$(
	engine: RxdbSyncEngine,
	descriptor: EngineQueryDescriptor,
	result$: Observable<QueryResult<RxCollection>>,
	queryKey$: Observable<string | null>
): Observable<{ total: number; source: TotalSource }> {
	const database$ = observeEngineDatabases(engine).pipe(
		shareReplay({ bufferSize: 1, refCount: true })
	);
	const lanes$ = coverageDocuments$<CoverageLaneDocument>(database$, 'coverageLanes');
	const totals$ =
		descriptor.collection === 'orders'
			? coverageDocuments$<QueryTotalCacheDocument>(database$, 'queryTotalCacheEntries')
			: of([] as QueryTotalCacheDocument[]);
	const coverage$ = combineLatest([lanes$, totals$]).pipe(
		switchMap(([lanes, queryTotals]) =>
			coverageFreshnessTicks(lanes, queryTotals).pipe(
				map((nowMs) => ({ lanes, queryTotals, nowMs }))
			)
		)
	);
	return combineLatest([
		result$.pipe(map((result) => result.count ?? result.hits.length)),
		coverage$,
		queryKey$,
	]).pipe(
		map(([localCount, { lanes, queryTotals, nowMs }, queryKey]) =>
			projectTotal({
				localCount,
				queryKey,
				lanes,
				queryTotals,
				nowMs,
			})
		),
		distinctUntilChanged(
			(previous, current) => previous.total === current.total && previous.source === current.source
		),
		shareReplay({ bufferSize: 1, refCount: true })
	);
}

function searchFieldsFor(
	localDB: RxDatabase,
	collection: LegacyCollectionName
): string[] | undefined {
	const fields = localDB.collections[collection]?.options?.searchFields;
	return Array.isArray(fields) ? [...fields] : undefined;
}

function emptyResult(): QueryResult<RxCollection> {
	return { searchActive: false, count: 0, hits: [] };
}

export function useLogsBinding(state: QueryStateOf<'logs'>): QueryBinding {
	const translated = translateQueryState('logs', state);
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
		totalSource$: LOCAL_TOTAL_SOURCE$,
		active$: INACTIVE$,
		sync: async () => undefined,
	};
}

function useEngineBinding(
	descriptorInput: EngineQueryDescriptor,
	enabled = true
): QueryBinding & {
	result$: Observable<QueryResult<RxCollection>>;
	whenReady(): Promise<void>;
} {
	const runtime = useQueryRuntime();
	const bindingId = React.useId();
	const descriptor = useStableDescriptor({
		...descriptorInput,
		searchFields: searchFieldsFor(runtime.localDB, descriptorInput.collection),
	});
	const demand = useDemand(runtime.engine, bindingId, descriptor, enabled);
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
				searchActive: Boolean(descriptor.search?.trim()),
			})),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}, [descriptor, enabled, runtime.engine, runtime.locale]);
	const projection$ = React.useMemo(
		() => coverageProjection$(runtime.engine, descriptor, result$, demand.queryKey$),
		[demand.queryKey$, descriptor, result$, runtime.engine]
	);
	const resource = useObservableResource(result$);
	const total$ = React.useMemo(() => projection$.pipe(map(({ total }) => total)), [projection$]);
	const totalSource$ = React.useMemo(
		() => projection$.pipe(map(({ source }) => source)),
		[projection$]
	);
	return {
		resource,
		result$,
		active$,
		total$,
		totalSource$,
		sync: demand.sync,
		whenReady: demand.whenReady,
	};
}

export function useCollectionBinding<C extends Exclude<CollectionKey, 'logs'>>(
	collection: C,
	state: QueryStateOf<C>,
	options: { wooIds?: readonly number[] } = {}
): QueryBinding {
	const translated = translateQueryState(collection, state);
	const selector =
		options.wooIds === undefined
			? translated.selector
			: { ...translated.selector, id: { $in: [...options.wooIds] } };
	const engineDescriptor: EngineQueryDescriptor = {
		collection: translated.collectionName as LegacyCollectionName,
		selector,
		sort: translated.sort as MangoQuerySortPart<Record<string, unknown>>[],
		limit: translated.limit,
		search: translated.search,
	};
	return useEngineBinding(engineDescriptor);
}

function andSelector(
	left: Record<string, unknown>,
	right: Record<string, unknown>
): Record<string, unknown> {
	if (Object.keys(left).length === 0) return right;
	return { $and: [left, right] };
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
		const requirements = requirementsForQuery({
			id,
			collectionName: 'products',
			selector: descriptor.selector,
			limit: undefined,
		}).requirements;
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
	const translated = translateQueryState('products', state);
	const descriptor = useStableDescriptor({
		collection: 'products',
		selector: translated.selector,
		sort: translated.sort as MangoQuerySortPart<Record<string, unknown>>[],
		limit: translated.limit,
		search: translated.search,
		searchFields: searchFieldsFor(runtime.localDB, 'products'),
	});
	const childDescriptor = useStableDescriptor({
		collection: 'variations',
		selector: state.filters.status ? { status: state.filters.status } : {},
		sort: [{ id: 'asc' }],
		search: translated.search,
		searchFields: searchFieldsFor(runtime.localDB, 'variations'),
	});
	const parentDemand = useDemand(runtime.engine, `${bindingId}:parent`, descriptor, true);
	const childDemand = useDemand(
		runtime.engine,
		`${bindingId}:child`,
		childDescriptor,
		Boolean(translated.search)
	);
	const result$ = React.useMemo(() => {
		if (!translated.search) {
			return observeEngineQuery(runtime.engine, runtime.locale, descriptor).pipe(
				shareReplay({ bufferSize: 1, refCount: true })
			);
		}
		const direct$ = observeEngineQuery(runtime.engine, runtime.locale, {
			...descriptor,
			limit: undefined,
		});
		const children$ = observeEngineQuery(runtime.engine, runtime.locale, childDescriptor);
		return combineLatest([direct$, children$]).pipe(
			switchMap(([direct, children]) => {
				const counts = new Map<number, number>();
				for (const hit of children.hits) {
					const parentId = Number((hit.document as unknown as Record<string, unknown>).parent_id);
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
					search: '',
					selector: andSelector((descriptor.selector ?? {}) as Record<string, unknown>, {
						uuid: { $in: uuids },
					}),
				}).pipe(
					map((result) => ({
						...result,
						searchActive: Boolean(descriptor.search?.trim()),
						hits: result.hits.map((hit) => {
							const wooId = Number((hit.document as unknown as Record<string, unknown>).id);
							return {
								...hit,
								childrenSearchCount: counts.get(wooId) ?? 0,
								parentSearchTerm: translated.search,
							};
						}),
					}))
				);
			}),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}, [bindingId, childDescriptor, descriptor, runtime.engine, runtime.locale, translated.search]);
	const resource = useObservableResource(result$);
	const projection$ = React.useMemo(
		() => coverageProjection$(runtime.engine, descriptor, result$, parentDemand.queryKey$),
		[descriptor, parentDemand.queryKey$, result$, runtime.engine]
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
	return {
		resource,
		result$,
		active$,
		total$: projection$.pipe(map(({ total }) => total)),
		totalSource$: projection$.pipe(map(({ source }) => source)),
		sync,
	};
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
	const binding = useEngineBinding(searchSelectDescriptor(collection, committedSearch, limit));
	return { ...binding, search, setSearch, committedSearch };
}

/** Full reference-lane category residents for the hierarchical category tree. */
export function useAllCategoriesBinding() {
	return useEngineBinding({
		collection: 'products/categories',
		selector: {},
		sort: [{ name: 'asc' }],
	});
}

/** How long the coupon replay waits for its reference pull before giving up on it. */
const COUPON_REFERENCE_SETTLE_TIMEOUT_MS = 10_000;

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
 */
export function useAppliedCouponReferenceDemand(hasAppliedCoupons: boolean): {
	whenSettled: () => Promise<boolean>;
} {
	const coupons = useEngineBinding(COUPON_REPLAY_COUPONS_DESCRIPTOR, hasAppliedCoupons);
	const categories = useEngineBinding(COUPON_REPLAY_CATEGORIES_DESCRIPTOR, hasAppliedCoupons);
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
		}),
		[categories, coupons, quiet$]
	);
}
