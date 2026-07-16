import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { BehaviorSubject, combineLatest, EMPTY, Observable, of, timer } from 'rxjs';
import {
	distinctUntilChanged,
	expand,
	map,
	shareReplay,
	startWith,
	switchMap,
} from 'rxjs/operators';

import {
	type CoverageLaneDocument,
	declareRequirements,
	type EngineEvent,
	type EngineLane,
	type EngineQueryDescriptor,
	observeEngineDatabases,
	observeEngineQuery,
	type QueryResult,
	type QueryTotalCacheDocument,
	registerActiveBinding,
	type RequirementHandle,
	requirementsForQuery,
	type RxdbSyncEngine,
	type SyncCollectionName,
	useLocalQuery,
	useQueryManager,
} from '@wcpos/query';

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

const FIXED_COLLECTIONS_BY_LANE: Partial<Record<EngineLane, readonly SyncCollectionName[]>> = {
	'reference-seed': ['categories', 'brands', 'tags', 'coupons'],
	'product-browse-window-seed': ['products'],
	'order-window-seed': ['orders'],
};

const ENGINE_COLLECTION_BY_LEGACY: Record<LegacyCollectionName, SyncCollectionName> = {
	products: 'products',
	variations: 'variations',
	orders: 'orders',
	customers: 'customers',
	taxes: 'taxRates',
	'products/categories': 'categories',
	'products/tags': 'tags',
	'products/brands': 'brands',
	coupons: 'coupons',
};

const LANE_ACTIVITY_SAFETY_MS = 60_000;
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
	const resource = React.useMemo(() => new ObservableResource(observable$), [observable$]);
	React.useEffect(() => {
		// The resource owns the direct RxDB/db$ subscription for this descriptor.
		return () => resource.destroy();
	}, [resource]);
	return resource;
}

function useLaneActivity(
	engine: RxdbSyncEngine,
	collection: LegacyCollectionName,
	enabled: boolean
): Observable<boolean> {
	const activity$ = React.useMemo(() => new BehaviorSubject(false), [engine, collection]);
	React.useEffect(() => {
		if (!enabled) return undefined;
		const engineCollection = ENGINE_COLLECTION_BY_LEGACY[collection];
		const starts = new Map<EngineLane, number[]>();
		let safetyTimer: ReturnType<typeof setTimeout> | undefined;
		const publish = () => {
			const active = [...starts].some(
				([lane, laneStarts]) =>
					laneStarts.length > 0 &&
					(FIXED_COLLECTIONS_BY_LANE[lane] ?? []).includes(engineCollection)
			);
			if (activity$.value !== active) activity$.next(active);
		};
		const prune = () => {
			const now = Date.now();
			for (const [lane, laneStarts] of starts) {
				const fresh = laneStarts.filter((startedAt) => now - startedAt <= LANE_ACTIVITY_SAFETY_MS);
				if (fresh.length === 0) starts.delete(lane);
				else starts.set(lane, fresh);
			}
		};
		const scheduleSafety = () => {
			if (safetyTimer !== undefined) clearTimeout(safetyTimer);
			const oldest = [...starts.values()].flat().sort((a, b) => a - b)[0];
			if (oldest === undefined) return;
			safetyTimer = setTimeout(
				() => {
					prune();
					publish();
					scheduleSafety();
				},
				Math.max(0, oldest + LANE_ACTIVITY_SAFETY_MS - Date.now() + 1)
			);
		};
		const unsubscribe = engine.events((event: EngineEvent) => {
			if (event.type !== 'lane-start' && event.type !== 'lane-finish') return;
			prune();
			if (event.type === 'lane-start') {
				starts.set(event.lane, [...(starts.get(event.lane) ?? []), Date.now()]);
			} else {
				const laneStarts = starts.get(event.lane) ?? [];
				laneStarts.pop();
				if (laneStarts.length === 0) starts.delete(event.lane);
			}
			publish();
			scheduleSafety();
		});
		return () => {
			unsubscribe();
			if (safetyTimer !== undefined) clearTimeout(safetyTimer);
			activity$.next(false);
		};
	}, [activity$, collection, enabled, engine]);
	return activity$.pipe(distinctUntilChanged());
}

type DemandProjection = {
	active$: Observable<boolean>;
	searchActive$: Observable<boolean>;
	sync(): Promise<void>;
};

function useDemand(
	engine: RxdbSyncEngine,
	id: string,
	descriptor: EngineQueryDescriptor,
	enabled: boolean
): DemandProjection {
	const active$ = React.useMemo(() => new BehaviorSubject(false), [engine, id]);
	const searchActive$ = React.useMemo(() => new BehaviorSubject(false), [engine, id]);
	const generation = React.useRef(0);
	const demandPending = React.useRef(0);
	const syncPending = React.useRef(0);
	const searchDemandPending = React.useRef(0);
	const searchSyncPending = React.useRef(0);
	const publish = React.useCallback(() => {
		const active = demandPending.current + syncPending.current > 0;
		if (active$.value !== active) active$.next(active);
		const searchActive = searchDemandPending.current + searchSyncPending.current > 0;
		if (searchActive$.value !== searchActive) searchActive$.next(searchActive);
	}, [active$, searchActive$]);
	const selector = selectorWithSearch(descriptor);
	const selectorKey = JSON.stringify(selector);

	React.useEffect(() => {
		generation.current += 1;
		if (!enabled) {
			demandPending.current = 0;
			searchDemandPending.current = 0;
			publish();
			return undefined;
		}
		const stableSelector = JSON.parse(selectorKey) as Record<string, unknown>;
		const binding = {
			id,
			collectionName: descriptor.collection,
			selector: stableSelector,
			limit: descriptor.limit,
		};
		const unregister = registerActiveBinding(engine, binding);
		const requirements = requirementsForQuery(binding);
		const isSearch = Boolean(descriptor.search?.trim());
		let handles: RequirementHandle[] = [];
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		const declare = (retryOnReject: boolean) => {
			const declarationGeneration = (generation.current += 1);
			handles = declareRequirements(engine, requirements);
			demandPending.current = handles.length;
			searchDemandPending.current = isSearch ? handles.length : 0;
			publish();
			for (const handle of handles) {
				const settle = () => {
					if (generation.current !== declarationGeneration) return;
					demandPending.current = Math.max(0, demandPending.current - 1);
					if (isSearch) {
						searchDemandPending.current = Math.max(0, searchDemandPending.current - 1);
					}
					publish();
				};
				const reject = () => {
					settle();
					if (!retryOnReject || generation.current !== declarationGeneration) return;
					const invalidatedGeneration = (generation.current += 1);
					demandPending.current = 0;
					searchDemandPending.current = 0;
					publish();
					retryTimer = setTimeout(() => {
						if (generation.current !== invalidatedGeneration) return;
						releaseHandles(handles);
						declare(false);
					}, DEMAND_RETRY_BACKOFF_MS);
				};
				void handle.ready.then(settle, reject);
			}
		};
		declare(true);
		return () => {
			unregister();
			if (retryTimer !== undefined) clearTimeout(retryTimer);
			releaseHandles(handles);
			generation.current += 1;
			demandPending.current = 0;
			searchDemandPending.current = 0;
			publish();
		};
	}, [
		descriptor.collection,
		descriptor.limit,
		descriptor.search,
		enabled,
		engine,
		id,
		publish,
		selectorKey,
	]);

	React.useEffect(
		() => () => {
			active$.complete();
			searchActive$.complete();
		},
		[active$, searchActive$]
	);

	const sync = React.useCallback(async () => {
		if (!enabled) return;
		const requirements = requirementsForQuery({
			id: `${id}:sync`,
			collectionName: descriptor.collection,
			selector: selectorWithSearch(descriptor),
			limit: descriptor.limit,
			priority: 1000,
			forceRefresh: true,
		});
		const handles = declareRequirements(engine, requirements);
		syncPending.current += 1;
		if (descriptor.search?.trim()) searchSyncPending.current += 1;
		publish();
		await Promise.all(handles.map((handle) => handle.ready.catch(() => undefined)));
		for (const handle of handles) handle.release();
		try {
			await engine.sync('scheduler-drain');
		} finally {
			syncPending.current = Math.max(0, syncPending.current - 1);
			if (descriptor.search?.trim()) {
				searchSyncPending.current = Math.max(0, searchSyncPending.current - 1);
			}
			publish();
		}
	}, [descriptor, enabled, engine, id, publish]);

	return { active$: active$.pipe(distinctUntilChanged()), searchActive$, sync };
}

function isFullyRepresentedOrderSelector(selector: Record<string, unknown>): boolean {
	return Object.entries(selector).every(([field, value]) => {
		if (field === 'search') return typeof value === 'string';
		if (field !== 'status') return false;
		if (typeof value === 'string') return value.length > 0;
		const status = value as Record<string, unknown> | null;
		return (
			status !== null &&
			typeof status === 'object' &&
			Object.keys(status).length === 1 &&
			typeof status.$eq === 'string'
		);
	});
}

function coverageQueryKey(id: string, descriptor: EngineQueryDescriptor): string | null {
	const selector = selectorWithSearch(descriptor);
	if (descriptor.collection === 'orders' && !isFullyRepresentedOrderSelector(selector)) return null;
	const requirement = requirementsForQuery({
		id,
		collectionName: descriptor.collection,
		selector,
		limit: descriptor.limit,
	}).find((candidate) => candidate.kind === 'query' && candidate.queryKey);
	if (requirement?.queryKey) return requirement.queryKey;
	if (descriptor.collection === 'products' && Object.keys(selector).length === 0) {
		return 'products:browse-window:limit=100';
	}
	if (Object.keys(selector).length > 0) return null;
	return COMPLETE_COLLECTION_LANES[descriptor.collection] ?? null;
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
	id: string,
	descriptor: EngineQueryDescriptor,
	result$: Observable<QueryResult<RxCollection>>
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
	]).pipe(
		map(([localCount, { lanes, queryTotals, nowMs }]) =>
			projectTotal({
				localCount,
				queryKey: coverageQueryKey(id, descriptor),
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
	return { elapsed: 0, searchActive: false, count: 0, hits: [] };
}

function useEngineBinding(
	descriptorInput: EngineQueryDescriptor,
	enabled = true
): QueryBinding & { result$: Observable<QueryResult<RxCollection>> } {
	const runtime = useQueryManager();
	const bindingId = React.useId();
	const descriptor = useStableDescriptor({
		...descriptorInput,
		searchFields: searchFieldsFor(runtime.localDB, descriptorInput.collection),
	});
	const demand = useDemand(runtime.engine, bindingId, descriptor, enabled);
	const laneActive$ = useLaneActivity(runtime.engine, descriptor.collection, enabled);
	const active$ = React.useMemo(
		() =>
			combineLatest([demand.active$, laneActive$]).pipe(
				map(([demandActive, laneActive]) => demandActive || laneActive),
				distinctUntilChanged(),
				shareReplay({ bufferSize: 1, refCount: true })
			),
		[demand.active$, laneActive$]
	);
	const result$ = React.useMemo(() => {
		if (!enabled) return of(emptyResult());
		return combineLatest([
			observeEngineQuery(runtime.engine, runtime.locale, descriptor),
			demand.searchActive$.pipe(startWith(false)),
		]).pipe(
			map(([result, searchActive]) => ({ ...result, searchActive })),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}, [demand.searchActive$, descriptor, enabled, runtime.engine, runtime.locale]);
	const projection$ = React.useMemo(
		() => coverageProjection$(runtime.engine, bindingId, descriptor, result$),
		[bindingId, descriptor, result$, runtime.engine]
	);
	const resource = useObservableResource(result$);
	const total$ = React.useMemo(() => projection$.pipe(map(({ total }) => total)), [projection$]);
	const totalSource$ = React.useMemo(
		() => projection$.pipe(map(({ source }) => source)),
		[projection$]
	);
	return { resource, result$, active$, total$, totalSource$, sync: demand.sync };
}

export function useCollectionBinding<C extends CollectionKey>(
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
		collection:
			collection === 'logs' ? 'products' : (translated.collectionName as LegacyCollectionName),
		selector,
		sort: translated.sort as MangoQuerySortPart<Record<string, unknown>>[],
		limit: translated.limit,
		search: translated.search,
	};
	const engineBinding = useEngineBinding(engineDescriptor, collection !== 'logs');
	const local = useLocalQuery({
		collectionName: 'logs',
		selector,
		sort: translated.sort,
		limit: translated.limit,
		search: translated.search,
	});
	return collection === 'logs'
		? {
				resource: local.resource as unknown as ObservableResource<QueryResult<RxCollection>>,
				result$: local.result$ as unknown as Observable<QueryResult<RxCollection>>,
				total$: local.total$,
				totalSource$: LOCAL_TOTAL_SOURCE$,
				active$: INACTIVE$,
				sync: async () => undefined,
			}
		: engineBinding;
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
	searchFields: string[] | undefined,
	lookupActive$: BehaviorSubject<boolean>
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
		});
		const handles = declareRequirements(engine, requirements);
		lookupActive$.next(handles.length > 0);
		void Promise.all(handles.map((handle) => handle.ready.catch(() => undefined))).finally(() =>
			lookupActive$.next(false)
		);
		const subscription = observeEngineQuery(engine, locale, descriptor).subscribe(subscriber);
		return () => {
			subscription.unsubscribe();
			releaseHandles(handles);
			lookupActive$.next(false);
		};
	});
}

export function useRelationalCollectionBinding(state: QueryStateOf<'products'>): QueryBinding {
	const runtime = useQueryManager();
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
		selector: {},
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
	const laneActive$ = useLaneActivity(runtime.engine, 'products', true);
	const lookupActive$ = React.useMemo(
		() => new BehaviorSubject(false),
		[runtime.engine, bindingId]
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
					descriptor.searchFields,
					lookupActive$
				).pipe(map((lookup) => ({ direct, lookup, counts })));
			}),
			switchMap(({ direct, lookup, counts }) => {
				const uuids = [...new Set([...direct.hits, ...lookup.hits].map((hit) => hit.id))];
				if (uuids.length === 0) return of(emptyResult());
				return observeEngineQuery(runtime.engine, runtime.locale, {
					...descriptor,
					search: '',
					selector: andSelector((descriptor.selector ?? {}) as Record<string, unknown>, {
						uuid: { $in: uuids },
					}),
				}).pipe(
					map((result) => ({
						...result,
						searchActive: false,
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
	}, [
		bindingId,
		childDescriptor,
		descriptor,
		lookupActive$,
		runtime.engine,
		runtime.locale,
		translated.search,
	]);
	const resource = useObservableResource(result$);
	const projection$ = React.useMemo(
		() => coverageProjection$(runtime.engine, bindingId, descriptor, result$),
		[bindingId, descriptor, result$, runtime.engine]
	);
	const active$ = React.useMemo(
		() =>
			combineLatest([
				parentDemand.active$,
				childDemand.active$,
				lookupActive$.pipe(startWith(false)),
				laneActive$,
			]).pipe(
				map((values) => values.some(Boolean)),
				distinctUntilChanged(),
				shareReplay({ bufferSize: 1, refCount: true })
			),
		[childDemand.active$, laneActive$, lookupActive$, parentDemand.active$]
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
	| 'customer'
	| 'category'
	| 'brand'
	| 'tag'
	| 'cashier'
	| 'coupon';

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
		sort: [{ [isCustomer ? 'last_name' : collection === 'coupon' ? 'code' : 'name']: 'asc' }],
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
