import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { combineLatest, EMPTY, of, BehaviorSubject as RxBehaviorSubject, timer } from 'rxjs';
import { distinctUntilChanged, expand, map, switchMap } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';
import type {
	CoverageLaneDocument,
	EngineRequirement,
	QueryTotalCacheDocument,
	RequirementHandle,
	RxdbSyncEngine,
} from '@wcpos/sync-engine';

import {
	engineCollectionNameFor,
	isMappedCollection,
	LEGACY_COLLECTION_NAMES,
	type LegacyCollectionName,
} from './engine-adapter/collection-map';
import {
	createPendingEngineCollection,
	type PendingEngineCollection,
} from './engine-adapter/pending-collection';
import { Query } from './query-state';
import { Registry } from './registry';
import { RelationalQuery } from './relational-query-state';
import { declareRequirements, requirementsForQuery } from './requirement-bridge';
import { SubscribableBase } from './subscribable-base';
import { syncTemplates } from './templates';

import type { QueryParams } from './query-state';
import type { BehaviorSubject, Observable } from 'rxjs';
import type { RxCollection, RxDatabase, RxDocument, RxQuery } from 'rxdb';

const queryLogger = getLogger(['wcpos', 'query', 'manager']);

const COMPLETE_COLLECTION_LANES: Partial<Record<LegacyCollectionName, string>> = {
	taxes: 'taxRates:all',
	'products/categories': 'categories:all',
	'products/tags': 'tags:all',
	'products/brands': 'brands:all',
	coupons: 'coupons:all',
};

function selectorWithSearch(rxQuery: RxQuery | undefined): Record<string, unknown> {
	const mango = cloneDeep(rxQuery?.mangoQuery ?? {});
	const selector = (mango.selector ?? {}) as Record<string, unknown>;
	const search = rxQuery?.other?.search?.searchTerm ?? rxQuery?.other?.relationalSearch?.searchTerm;
	if (search) {
		selector.search = search;
	}
	return selector;
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

function coverageQueryKey(input: {
	query: Query<RxCollection>;
	rxQuery: RxQuery | undefined;
}): string | null {
	const { query, rxQuery } = input;
	if (!query.collectionName || !isMappedCollection(query.collectionName)) {
		return null;
	}
	const selector = selectorWithSearch(rxQuery);
	if (query.collectionName === 'orders' && !isFullyRepresentedOrderSelector(selector)) {
		return null;
	}
	const requirement = requirementsForQuery({
		id: query.id,
		collectionName: query.collectionName,
		selector,
		limit: rxQuery?.mangoQuery?.limit,
	}).find((candidate) => candidate.kind === 'query' && candidate.queryKey);
	if (requirement?.queryKey) {
		return requirement.queryKey;
	}

	// The products browse-window lane covers only the unfiltered default browse.
	// Filter/search/targeted product results retain their local-count fallback.
	if (query.collectionName === 'products' && Object.keys(selector).length === 0) {
		return 'products:browse-window:limit=100';
	}
	if (Object.keys(selector).length > 0) {
		return null;
	}
	return COMPLETE_COLLECTION_LANES[query.collectionName] ?? null;
}

/** Emit at each exact freshness boundary so an idle total cannot remain stale. */
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

function projectedCoverageTotal(input: {
	localCount: number;
	queryKey: string | null;
	lanes: CoverageLaneDocument[];
	queryTotals: QueryTotalCacheDocument[];
	nowMs: number;
}): number {
	if (input.queryKey === null) {
		return input.localCount;
	}
	const queryTotal = input.queryTotals.find(
		(candidate) => candidate.queryKey === input.queryKey && candidate.freshUntilMs > input.nowMs
	);
	if (queryTotal) {
		return queryTotal.totalMatchingRecords;
	}
	const lane = input.lanes.find(
		(candidate) =>
			candidate.queryKey === input.queryKey &&
			candidate.complete &&
			candidate.freshUntilMs > input.nowMs
	);
	return lane ? lane.expectedRecordIds.length : input.localCount;
}

export interface RegisterQueryConfig {
	queryKeys: (string | number | object)[];
	collectionName: string;
	initialParams?: QueryParams;
	endpoint?: string;
	greedy?: boolean;
	infiniteScroll?: boolean;
	pageSize?: number;
}

/**
 * Per-query demand-plane bookkeeping (ADR 0027). `handles` are the live engine
 * requirement handles this surface declared; `active$` reflects whether any of
 * them (or a `sync()` promise) are in flight — the honest 1b projection of the
 * old per-query `active$`. Lane start/finish events now exist but do not carry
 * query-surface attribution, so lane-wide activity remains increment 5 work.
 */
interface QueryDemand {
	handles: RequirementHandle[];
	requirements: EngineRequirement[];
	active$: BehaviorSubject<boolean>;
	inFlight: number;
	searchActive$: BehaviorSubject<boolean>;
	searchInFlight: number;
	searchGeneration: number;
	searchSyncInFlight: number;
}

/**
 * The Manager holds an ENGINE, not an http client / fast-local db (ADR 0023
 * increment 1b). `localDB` survives ONLY for the local-only `logs` collection
 * (and the dedicated `templates` fetch target); every fluent read is served from
 * the engine database through the engine-adapter. `httpClient` remains only for
 * the dedicated templates fetch target.
 */
export class Manager<TDatabase extends RxDatabase> extends SubscribableBase {
	public readonly queryStates: Registry<string, Query<RxCollection>>;
	/** Live engine requirement handles per query id (the demand plane). */
	private readonly demandByQuery = new Map<string, QueryDemand>();

	/**
	 * Stable per-collection stand-ins used while the engine database is still
	 * opening (`engine.active()` is null). Cached so repeated `getCollection`
	 * calls return the SAME reference — `registerQuery`'s identity check then
	 * treats the pending query as unchanged (no per-render churn) and swaps it
	 * for the live collection only once the engine opens.
	 */
	private readonly pendingCollections = new Map<string, PendingEngineCollection>();

	private static instance: Manager<any>;

	private constructor(
		public localDB: TDatabase,
		public engine: RxdbSyncEngine,
		public locale: string,
		public httpClient?: any
	) {
		super();
		this.queryStates = new Registry();

		(this.localDB as any).onClose.push(() => {
			void this.cancel().catch((error) =>
				queryLogger.error('Manager cancel on db close failed', { context: { error } })
			);
		});

		// Cold start: queries registered before the engine database opens bind to a
		// pending stand-in and render empty. Once `engine.ready` settles the live
		// collections exist — nudge the local `reset$` bridge so every engine-backed
		// `useQuery` re-registers and rebinds to the live collection (going live).
		// A failed initial open leaves the app degraded (empty), never dead.
		void this.engine.ready
			.then(() => this.nudgeEngineCollectionsReady())
			.catch((error) =>
				queryLogger.debug('Engine ready rejected — queries stay degraded (empty)', {
					context: { error },
				})
			);
	}

	/**
	 * Signal every engine-backed collection as "reset" so bound queries
	 * re-register and rebind from their pending stand-in to the now-open live
	 * collection. Idempotent: a query already bound to the live collection
	 * re-registers to the same instance and is returned unchanged.
	 */
	private nudgeEngineCollectionsReady(): void {
		this.pendingCollections.clear();
		const resetSubject = (this.localDB as any).reset$;
		if (!resetSubject || typeof resetSubject.next !== 'function') {
			return;
		}
		for (const collectionName of LEGACY_COLLECTION_NAMES) {
			resetSubject.next({ name: collectionName });
		}
	}

	public static getInstance<TDatabase extends RxDatabase>(
		localDB: TDatabase,
		engine: RxdbSyncEngine,
		locale: string = 'en',
		httpClient?: any
	) {
		if (
			Manager.instance &&
			Manager.instance.localDB === localDB &&
			Manager.instance.engine === engine &&
			Manager.instance.locale === locale
		) {
			return Manager.instance as Manager<TDatabase>;
		}

		if (Manager.instance) {
			void Manager.instance
				.cancel()
				.catch((error) =>
					queryLogger.error('Previous Manager instance cancel failed', { context: { error } })
				);
		}

		Manager.instance = new Manager(localDB, engine, locale, httpClient);
		return Manager.instance as Manager<TDatabase>;
	}

	stringify(params: unknown): string {
		try {
			return JSON.stringify(params);
		} catch (error) {
			queryLogger.error(`Failed to serialize query key: ${error}`, {
				showToast: true,
				saveToDb: true,
				context: { errorCode: ERROR_CODES.INVALID_REQUEST_FORMAT },
			});
			return '';
		}
	}

	hasQuery(queryKeys: (string | number | object)[]): boolean {
		const key = this.stringify(queryKeys);
		return this.queryStates.has(key);
	}

	/**
	 * Resolve the RxDB collection that backs a fluent query:
	 *  - engine-mapped collections (products, orders, taxes, …) → the engine
	 *    database collection (reads route through the adapter),
	 *  - `logs` / `templates` → the local database collection (direct read path).
	 */
	getCollection(collectionName: string) {
		if (isMappedCollection(collectionName)) {
			const active = this.engine.active();
			const collection = active?.database.collections[engineCollectionNameFor(collectionName)];
			if (collection) {
				return collection;
			}
			// The engine database is still opening (`active()` is null) or hasn't
			// created this collection yet. Return a STABLE pending stand-in so the
			// query is constructible and degrades to empty results — never undefined
			// (which crashed screens reading `query.resource`). Rebound to the live
			// collection when `engine.ready` settles (see nudgeEngineCollectionsReady).
			return this.getPendingEngineCollection(collectionName);
		}
		const local = (this.localDB as any).collections[collectionName];
		if (!local) {
			queryLogger.error(`Collection with name: ${collectionName} not found.`, {
				showToast: true,
				saveToDb: true,
				context: { errorCode: ERROR_CODES.INVALID_CONFIGURATION, collectionName },
			});
		}
		return local;
	}

	/**
	 * Return (and cache) the stable pending stand-in for an engine-backed
	 * collection. Cached so the reference is identity-stable across renders while
	 * the engine opens; cleared on `nudgeEngineCollectionsReady`.
	 */
	private getPendingEngineCollection(
		collectionName: LegacyCollectionName
	): PendingEngineCollection {
		let pending = this.pendingCollections.get(collectionName);
		if (!pending) {
			pending = createPendingEngineCollection(this.engine, collectionName);
			this.pendingCollections.set(collectionName, pending);
		}
		return pending;
	}

	/** Read the unchanged legacy collection recipe that owns the search field paths. */
	private searchFieldsFor(collectionName: string): string[] | undefined {
		const collection = this.localDB.collections[collectionName] as RxCollection | undefined;
		const fields = collection?.options?.searchFields;
		return Array.isArray(fields) ? [...fields] : undefined;
	}

	registerQuery({
		queryKeys,
		collectionName,
		initialParams,
		greedy,
		infiniteScroll,
		pageSize,
		...args
	}: RegisterQueryConfig) {
		const key = this.stringify(queryKeys);
		const endpoint = args.endpoint || collectionName;

		if (this.queryStates.has(key)) {
			const existingQuery = this.queryStates.get(key);
			const existingCollection = existingQuery?.collection;
			const currentCollection = this.getCollection(collectionName);
			const isSameCollection = existingCollection === currentCollection;
			const isCollectionDestroyed = (existingCollection as any)?.destroyed;

			if (isCollectionDestroyed || !isSameCollection) {
				void this.deregisterQuery(key).catch((error) =>
					queryLogger.error('Failed to deregister stale query', {
						context: { key, collectionName, error },
					})
				);
			} else {
				return existingQuery;
			}
		}

		const collection = this.getCollection(collectionName);
		if (!collection) {
			queryLogger.error('registerQuery: collection not found, cannot register', {
				showToast: false,
				saveToDb: false,
				context: { key, collectionName },
			});
			return undefined;
		}

		const queryState = new Query<typeof collection>({
			id: key,
			collection,
			collectionName,
			initialParams,
			endpoint,
			greedy,
			locale: this.locale,
			infiniteScroll,
			pageSize,
			searchFields: this.searchFieldsFor(collectionName),
		});

		this.queryStates.set(key, queryState);
		this.onNewQueryState(queryState);

		return this.queryStates.get(key);
	}

	registerRelationalQuery(
		{
			queryKeys,
			collectionName,
			initialParams,
			greedy,
			infiniteScroll,
			pageSize,
			...args
		}: RegisterQueryConfig,
		childQuery: Query<any>,
		parentLookupQuery: Query<any>
	) {
		const key = this.stringify(queryKeys);
		const endpoint = args.endpoint || collectionName;

		if (this.queryStates.has(key)) {
			const existingQuery = this.queryStates.get(key);
			const existingCollection = existingQuery?.collection;
			const currentCollection = this.getCollection(collectionName);
			const isSameCollection = existingCollection === currentCollection;
			const isCollectionDestroyed = (existingCollection as any)?.destroyed;

			if (isCollectionDestroyed || !isSameCollection) {
				void this.deregisterQuery(key).catch((error) =>
					queryLogger.error('Failed to deregister stale relational query', {
						context: { key, collectionName, error },
					})
				);
			} else {
				return existingQuery;
			}
		}

		const collection = this.getCollection(collectionName);
		if (!collection) {
			queryLogger.error('registerRelationalQuery: collection not found, cannot register', {
				showToast: false,
				saveToDb: false,
				context: { key, collectionName },
			});
			return undefined;
		}

		const queryState = new RelationalQuery<typeof collection>(
			{
				id: key,
				collection,
				collectionName,
				initialParams,
				endpoint,
				greedy,
				locale: this.locale,
				infiniteScroll,
				pageSize,
				searchFields: this.searchFieldsFor(collectionName),
			},
			childQuery,
			parentLookupQuery
		);

		this.queryStates.set(key, queryState);
		this.onNewQueryState(queryState);

		return this.queryStates.get(key);
	}

	getQuery(queryKeys: (string | number | object)[]) {
		const key = this.stringify(queryKeys);
		const query = this.queryStates.get(key);

		if (!query) {
			queryLogger.error(`Query with key: ${key} not found.`, {
				showToast: true,
				saveToDb: true,
				context: { errorCode: ERROR_CODES.RECORD_NOT_FOUND, queryKey: key },
			});
		}

		return query;
	}

	async deregisterQuery(key: string): Promise<void> {
		const query = this.queryStates.get(key);
		if (query) {
			this.queryStates.delete(key);
			this.releaseDemand(key);
			await query.cancel();
		}
	}

	/**
	 * Called when a collection is reset/removed. Deregisters and cancels every
	 * query bound (by reference) to THIS collection instance.
	 */
	async onCollectionReset(collection: RxCollection): Promise<void> {
		const cancelPromises: Promise<void>[] = [];
		this.queryStates.forEach((query, key) => {
			if (query.collection === collection) {
				cancelPromises.push(this.deregisterQuery(key));
			}
		});
		await Promise.all(cancelPromises);
	}

	/**
	 * Tasks to perform when a new query state is registered. Instead of the old
	 * replication states, declare the query's engine requirements (the demand
	 * plane) and re-declare them when the query params or pagination change.
	 */
	onNewQueryState(queryState: Query<RxCollection>) {
		// Dedicated templates path (ADR 0025 carve-out): a direct fetch into the
		// local collection — NOT the demand plane and NOT the old machine.
		if (queryState.collectionName === 'templates') {
			void syncTemplates((this.localDB as any).collections.templates, this.httpClient);
			return;
		}

		if (!queryState.isEngineBacked) {
			return; // logs and other local-only collections declare no remote demand.
		}

		const demand: QueryDemand = {
			handles: [],
			requirements: [],
			active$: new RxBehaviorSubject<boolean>(false),
			inFlight: 0,
			searchActive$: new RxBehaviorSubject<boolean>(false),
			searchInFlight: 0,
			searchGeneration: 0,
			searchSyncInFlight: 0,
		};
		this.demandByQuery.set(queryState.id, demand);
		queryState.addSub(
			'search-demand-active',
			demand.searchActive$.subscribe((active) => queryState.setSearchDemandActive(active))
		);

		queryState.addSub(
			'query-requirements',
			queryState.rxQuery$.subscribe((rxQuery) => {
				this.declareQueryRequirements(queryState, rxQuery);
			})
		);

		queryState.addSub(
			'query-pagination',
			queryState.loadMore$.subscribe(() => {
				this.declareQueryRequirements(queryState, queryState.currentRxQuery);
			})
		);
	}

	private declareQueryRequirements(
		queryState: Query<RxCollection>,
		rxQuery: RxQuery | undefined
	): void {
		const demand = this.demandByQuery.get(queryState.id);
		if (!demand || !queryState.collectionName) {
			return;
		}
		const mango = cloneDeep(rxQuery?.mangoQuery ?? {});
		const selector = (mango.selector ?? {}) as Record<string, unknown>;
		const search =
			rxQuery?.other?.search?.searchTerm ?? rxQuery?.other?.relationalSearch?.searchTerm;
		if (search) {
			selector.search = search;
		}

		const requirements = requirementsForQuery({
			id: queryState.id,
			collectionName: queryState.collectionName,
			selector,
			limit: mango.limit,
		});
		if (isEqual(demand.requirements, requirements)) {
			return;
		}

		// Release the previous generation before declaring the changed demand.
		for (const handle of demand.handles) {
			handle.release();
		}

		demand.requirements = requirements;
		const handles = declareRequirements(this.engine, requirements);
		demand.handles = handles;
		for (const handle of handles) {
			void handle.ready.catch(() => {
				// A rejected generation must not suppress an identical retry.
				if (demand.handles === handles) {
					demand.requirements = [];
				}
			});
		}
		this.trackInFlight(
			demand,
			handles.map((handle) => handle.ready)
		);
		this.trackSearchGeneration(demand, search ? handles.map((handle) => handle.ready) : []);
	}

	private trackInFlight(demand: QueryDemand, promises: Promise<unknown>[]): void {
		if (promises.length === 0) {
			return;
		}
		demand.inFlight += promises.length;
		demand.active$.next(true);
		for (const promise of promises) {
			void promise.then(
				() => this.settleInFlight(demand),
				() => this.settleInFlight(demand)
			);
		}
	}

	private settleInFlight(demand: QueryDemand): void {
		demand.inFlight = Math.max(0, demand.inFlight - 1);
		if (demand.inFlight === 0) {
			demand.active$.next(false);
		}
	}

	private trackSearchGeneration(demand: QueryDemand, promises: Promise<unknown>[]): void {
		const generation = (demand.searchGeneration += 1);
		demand.searchInFlight = promises.length;
		this.updateSearchActive(demand);
		for (const promise of promises) {
			void promise.then(
				() => this.settleSearchGeneration(demand, generation),
				() => this.settleSearchGeneration(demand, generation)
			);
		}
	}

	private settleSearchGeneration(demand: QueryDemand, generation: number): void {
		if (generation !== demand.searchGeneration) {
			return;
		}
		demand.searchInFlight = Math.max(0, demand.searchInFlight - 1);
		this.updateSearchActive(demand);
	}

	private trackSyncSearchInFlight(demand: QueryDemand, promise: Promise<unknown>): void {
		demand.searchSyncInFlight += 1;
		this.updateSearchActive(demand);
		void promise.then(
			() => this.settleSyncSearchInFlight(demand),
			() => this.settleSyncSearchInFlight(demand)
		);
	}

	private settleSyncSearchInFlight(demand: QueryDemand): void {
		demand.searchSyncInFlight = Math.max(0, demand.searchSyncInFlight - 1);
		this.updateSearchActive(demand);
	}

	private updateSearchActive(demand: QueryDemand): void {
		const active = demand.searchInFlight + demand.searchSyncInFlight > 0;
		if (demand.searchActive$.value !== active) {
			demand.searchActive$.next(active);
		}
	}

	private invalidateSearchGeneration(demand: QueryDemand): void {
		demand.searchGeneration += 1;
		demand.searchInFlight = 0;
		this.updateSearchActive(demand);
	}

	private releaseDemand(queryId: string): void {
		const demand = this.demandByQuery.get(queryId);
		if (!demand) {
			return;
		}
		for (const handle of demand.handles) {
			handle.release();
		}
		this.invalidateSearchGeneration(demand);
		demand.active$.complete();
		demand.searchActive$.complete();
		this.demandByQuery.delete(queryId);
	}

	/**
	 * The `use-replication-state` projection surfaces (best-effort 1b semantics).
	 * `active$` reflects in-flight demand THIS surface initiated.
	 */
	replicationActive$(queryId: string): BehaviorSubject<boolean> | undefined {
		return this.demandByQuery.get(queryId)?.active$;
	}

	/**
	 * Coverage-aware `total$` source table (ADR 0023 increment 2 / ADR 0027):
	 *
	 * - `orders`: a fresh `queryTotalCacheEntries` value for the exact public
	 *   query requirement key; otherwise a fresh complete matching coverage lane;
	 *   otherwise the fluent local result count.
	 * - `products`: a fresh complete `products:browse-window:limit=100` lane only
	 *   for an unfiltered browse; filtered/search/targeted queries use local count.
	 * - `taxes`, `products/categories`, `products/tags`, `products/brands`, and
	 *   `coupons`: their fresh complete `*:all` greedy coverage lane; otherwise
	 *   local count (filtered/search views also fall back locally).
	 * - `variations` and `customers`: local count. Their public targeted/search
	 *   requirements deliberately hide the engine-owned lane query-key grammar.
	 * - local-only `logs` and `templates`: direct local count.
	 *
	 * Query-total cache rows outrank lane cardinality because they are the engine's
	 * explicit `totalMatchingRecords` projection. A lane cardinality is trusted
	 * only while the lane is both complete and fresh; ADR 0027 keeps local counts
	 * as the fallback for every other case.
	 */
	replicationTotal$(queryId: string): Observable<number> | undefined {
		const query = this.queryStates.get(queryId);
		if (!query) {
			return undefined;
		}
		const localCount$ = query.result$.pipe(map((result) => result.count ?? 0));
		if (!query.isEngineBacked) {
			return localCount$.pipe(distinctUntilChanged());
		}

		const database = query.collection.database as RxDatabase;
		const coverageLanes = database.collections.coverageLanes as
			| RxCollection<CoverageLaneDocument>
			| undefined;
		const queryTotalCacheEntries = database.collections.queryTotalCacheEntries as
			| RxCollection<QueryTotalCacheDocument>
			| undefined;
		if (!coverageLanes || !queryTotalCacheEntries) {
			return localCount$.pipe(distinctUntilChanged());
		}

		const lanes$ = coverageLanes
			.find()
			.$.pipe(
				map((documents: RxDocument<CoverageLaneDocument>[]) =>
					documents.map((document) => document.toJSON() as unknown as CoverageLaneDocument)
				)
			);
		const queryTotals$ = queryTotalCacheEntries
			.find()
			.$.pipe(
				map((documents: RxDocument<QueryTotalCacheDocument>[]) =>
					query.collectionName === 'orders'
						? documents.map((document) => document.toJSON() as unknown as QueryTotalCacheDocument)
						: []
				)
			);
		const coverageState$ = combineLatest([lanes$, queryTotals$]).pipe(
			switchMap(([lanes, queryTotals]) =>
				coverageFreshnessTicks(lanes, queryTotals).pipe(
					map((nowMs) => ({ lanes, queryTotals, nowMs }))
				)
			)
		);

		return combineLatest([localCount$, query.rxQuery$, coverageState$]).pipe(
			map(([localCount, rxQuery, { lanes, queryTotals, nowMs }]) =>
				projectedCoverageTotal({
					localCount,
					queryKey: coverageQueryKey({ query, rxQuery }),
					lanes,
					queryTotals,
					nowMs,
				})
			),
			distinctUntilChanged()
		);
	}

	/**
	 * `sync()` for a bound query: force a re-declaration of its requirement
	 * (forceRefresh) then drain — never a bare scheduler drain (completed tasks
	 * no-op). The full lane-lifecycle projection lands at increment 5 (ticket #537).
	 */
	async syncQuery(queryId: string): Promise<void> {
		const query = this.queryStates.get(queryId);
		const demand = this.demandByQuery.get(queryId);
		if (!query || !demand || !query.collectionName) {
			return;
		}
		const mango = cloneDeep(query.currentRxQuery?.mangoQuery ?? {});
		const selector = (mango.selector ?? {}) as Record<string, unknown>;
		const search =
			query.currentRxQuery?.other?.search?.searchTerm ??
			query.currentRxQuery?.other?.relationalSearch?.searchTerm;
		if (search) {
			selector.search = search;
		}
		const requirements = requirementsForQuery({
			id: `${queryId}:sync`,
			collectionName: query.collectionName,
			selector,
			limit: mango.limit,
			forceRefresh: true,
			priority: 1000,
		});
		const handles = declareRequirements(this.engine, requirements);
		const ready = Promise.all(handles.map((handle) => handle.ready)).then(
			() => undefined,
			() => undefined
		);
		this.trackInFlight(demand, [ready]);
		if (search) {
			this.trackSyncSearchInFlight(demand, ready);
		}
		await ready;
		for (const handle of handles) {
			handle.release();
		}
		try {
			await this.engine.sync('scheduler-drain');
		} catch {
			// periodic-class drain failure self-heals next tick.
		}
	}

	/**
	 * On useQuery unmount: release the query's demand handles so the engine can
	 * demote/abort in-flight foreground work for a surface no one is watching.
	 */
	maybePauseQueryReplications(query: Query<RxCollection>) {
		const demand = query && this.demandByQuery.get(query.id);
		if (!demand) {
			return;
		}
		for (const handle of demand.handles) {
			handle.release();
		}
		demand.handles = [];
		this.invalidateSearchGeneration(demand);
	}

	async cancel(): Promise<void> {
		await super.cancel();

		const queryPromises: Promise<void>[] = [];
		this.queryStates.forEach((query) => {
			queryPromises.push(query.cancel());
		});
		for (const queryId of [...this.demandByQuery.keys()]) {
			this.releaseDemand(queryId);
		}

		await Promise.all(queryPromises);
	}
}
