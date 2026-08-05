import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import {
	BehaviorSubject,
	combineLatest,
	EMPTY,
	firstValueFrom,
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
	isFullyRepresentedProductSelector,
	observeEngineDatabases,
	observeEngineQuery,
	orderRangeBoundSeconds,
	type QueryResult,
	registerActiveBinding,
	requirementsForQuery,
	type RequirementSortPart,
	useLocalQuery,
	useQueryRuntime,
} from '@wcpos/query';
import type {
	CoverageLaneDocument,
	EngineEvent,
	EngineLane,
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

const FIXED_COLLECTIONS_BY_LANE: Partial<Record<EngineLane, readonly SyncCollectionName[]>> = {
	'reference-seed': ['categories', 'brands', 'tags', 'coupons'],
	'product-browse-window-seed': ['products'],
	'order-window-seed': ['orders'],
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

function useLaneActivity(
	engine: RxdbSyncEngine,
	collection: LegacyCollectionName,
	enabled: boolean
): Observable<boolean> {
	const activity$ = React.useMemo(() => new BehaviorSubject(false), [engine, collection]);
	React.useEffect(() => {
		if (!enabled) return undefined;
		const engineCollection = engineCollectionNameFor(collection);
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
	// The products browse window travels with the grid's sort (#909), so the sort is part
	// of what the demand effect depends on — a serialized key keeps the array identity out.
	const sortKey = JSON.stringify(descriptor.sort ?? []);

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
			sort: JSON.parse(sortKey) as RequirementSortPart[],
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
		sortKey,
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
			sort: descriptor.sort as RequirementSortPart[] | undefined,
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

/**
 * A `created_via` slug the descriptor grammar can carry, in either the bare or `$eq` shape
 * the translator can produce. Mirrors `orderBrowseDescriptor`'s `/^[a-z0-9_-]+$/` rule.
 */
function representedCreatedVia(value: unknown): boolean {
	const slug =
		typeof value === 'string'
			? value
			: value !== null && typeof value === 'object' && Object.keys(value).length === 1
				? (value as Record<string, unknown>).$eq
				: undefined;
	return typeof slug === 'string' && /^[a-z0-9_-]+$/.test(slug);
}

/**
 * Whether the coverage lane for this selector's descriptor covers exactly the selector.
 *
 * The rules below have to match `orderBrowseDescriptor` in `@wcpos/query`, which is the
 * thing that decides what actually reaches the wire. Anything this predicate accepts but
 * the encoder drops widens the lane relative to the selector, and `projectTotal` then
 * reports that wider lane's size as the grid's total.
 */
function isFullyRepresentedOrderSelector(selector: Record<string, unknown>): boolean {
	return Object.entries(selector).every(([field, value]) => {
		if (field === 'search') return typeof value === 'string';
		if (field === 'created_via') return representedCreatedVia(value);
		if (field === '$and') {
			if (!Array.isArray(value) || value.length === 0) return false;
			return value.every((condition) => {
				if (condition === null || typeof condition !== 'object') return false;
				if ('created_via' in (condition as Record<string, unknown>)) {
					return representedCreatedVia((condition as Record<string, unknown>).created_via);
				}
				const metaData = (condition as Record<string, unknown>).meta_data;
				if (metaData === null || typeof metaData !== 'object') return false;
				const elemMatch = (metaData as Record<string, unknown>).$elemMatch;
				if (elemMatch === null || typeof elemMatch !== 'object') return false;
				const { key, value: metaValue } = elemMatch as Record<string, unknown>;
				// The encoder only emits `:cashier=`/`:store=` for an all-digits meta value.
				return (
					(key === '_pos_user' || key === '_pos_store') &&
					typeof metaValue === 'string' &&
					/^\d+$/.test(metaValue)
				);
			});
		}
		if (field === 'customer_id') {
			if (typeof value === 'number') return true;
			const customer = value as Record<string, unknown> | null;
			return (
				customer !== null &&
				typeof customer === 'object' &&
				Object.keys(customer).length === 1 &&
				typeof customer.$eq === 'number'
			);
		}
		if (field === 'date_created_gmt') {
			if (value === null || typeof value !== 'object') return false;
			const entries = Object.entries(value as Record<string, unknown>);
			const valid = entries.every(
				([operator, boundary]) =>
					(operator === '$gte' || operator === '$lte') &&
					// A bound the encoder cannot resolve to epoch seconds is dropped from the key,
					// which would leave the lane unbounded relative to the selector — so ask the
					// encoder's own parser rather than restating its rule here.
					// A bound the encoder cannot resolve to epoch seconds is dropped from the key,
					// which would leave the lane unbounded relative to the selector — so ask the
					// encoder's own parser rather than restating its rule here.
					orderRangeBoundSeconds(boundary) !== undefined
			);
			return entries.length > 0 && valid;
		}
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
	// Products browses became wired+windowed when filters went on the wire (2026-08-04
	// ruling), and the bridge deliberately emits only the REPRESENTABLE subset of the
	// selector — an attribute match or a mixed `$or` keeps narrowing locally. That superset
	// is right for demand and wrong for a total: a browse filtered on something the grammar
	// cannot carry would otherwise report the wider window's size as its own count. Unlike
	// the orders predicate above this asks the encoder itself, so the two cannot drift.
	if (descriptor.collection === 'products' && !isFullyRepresentedProductSelector(selector)) {
		return null;
	}
	const requirement = requirementsForQuery({
		id,
		collectionName: descriptor.collection,
		selector,
		limit: descriptor.limit,
		sort: descriptor.sort as RequirementSortPart[] | undefined,
	}).find((candidate) => candidate.kind === 'query' && candidate.queryKey);
	// The products browse-window key used to be hardcoded here at limit=100 regardless of
	// the descriptor (#909): the coverage lane the grid reported against was never the one
	// its own limit/sort demanded. It now comes from requirementsForQuery like every other
	// query key, so the projected total tracks the window the grid actually asked for.
	if (requirement?.queryKey) return requirement.queryKey;
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
	return { searchActive: false, count: 0, hits: [] };
}

function useEngineBinding(
	descriptorInput: EngineQueryDescriptor,
	enabled = true
): QueryBinding & { result$: Observable<QueryResult<RxCollection>> } {
	const runtime = useQueryRuntime();
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
	return {
		resource,
		result$,
		active$,
		total$,
		totalSource$,
		sync: demand.sync,
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
 */
export function useAppliedCouponReferenceDemand(hasAppliedCoupons: boolean): {
	whenSettled: () => Promise<boolean>;
} {
	const coupons = useEngineBinding(COUPON_REPLAY_COUPONS_DESCRIPTOR, hasAppliedCoupons);
	const categories = useEngineBinding(COUPON_REPLAY_CATEGORIES_DESCRIPTOR, hasAppliedCoupons);
	const settled$ = React.useMemo(
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
						settled$.pipe(map(() => true)),
						timer(COUPON_REFERENCE_SETTLE_TIMEOUT_MS).pipe(map(() => false))
					)
				),
		}),
		[settled$]
	);
}
