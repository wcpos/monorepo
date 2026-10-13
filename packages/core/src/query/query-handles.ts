/**
 * Query handles for the screens: the React edge of `@wcpos/query`'s handle primitive, and the
 * first handle factory, the relational products read (roadmap#423).
 *
 * A screen asks for a handle by query state; the key is the state's canonical JSON under the
 * collection's scope key, so the same query from two components (the grid and the quick-filter
 * preview) is one handle, and a parent's render, a store tick or a clock cannot re-issue it.
 * The owning component retains the handle while mounted; readers subscribe to it with
 * `useQueryHandleValue` (one subscription, one snapshot) or suspend on it with `useQuerySnapshot`.
 */

import * as React from 'react';

import {
	auditTime,
	combineLatest,
	defer,
	distinctUntilChanged,
	exhaustMap,
	map,
	merge,
	Observable,
	of,
	switchMap,
	take,
} from 'rxjs';

import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	declareRequirements,
	type DemandPlan,
	engineCollectionNameFor,
	type EngineQueryDescriptor,
	observeCollectionActive,
	observeEngineDatabases,
	observeEngineQuery,
	type QueryHandle,
	type QueryHandleSpec,
	type QueryResult,
	type QuerySnapshot,
	releaseHandles,
	useLocalQuery$,
	useQueryRuntime,
	useSearchFields,
} from '@wcpos/query';
import type { RequirementHandle, RxdbSyncEngine } from '@wcpos/sync-engine';
import type { RemoteId } from '@wcpos/sync-core';

import {
	compileQuery,
	requirementsForCompiledQuery,
	translateLogsQueryState,
} from './query-state-translator';
import { useScopeKey } from './scope-key';

import type { CollectionKey, QueryStateOf } from './query-state-types';
import type { RxCollection } from 'rxdb';

type CompiledQuery = ReturnType<typeof compileQuery>;
type ProductsResult = QueryResult<RxCollection>;

function emptyResult(): ProductsResult {
	return { searchActive: false, count: 0, hits: [] };
}

/** What the translator compiled, as the demand the handle declares. */
export function demandPlanFor(compiled: CompiledQuery): DemandPlan {
	return {
		collection: engineCollectionNameFor(compiled.collection),
		requirementsFor: (overlay) => requirementsForCompiledQuery(compiled.demand, overlay),
		represented: compiled.represented,
		coverage: compiled.coverage,
		isUnfiltered:
			compiled.read.complete &&
			Object.keys(compiled.read.prefilter).length === 0 &&
			compiled.read.search === '',
	};
}

// Demand ids are the handle's own: two components sharing a handle share one declaration.
let nextHandleId = 0;

/**
 * The parents of the variations a search matched: a read that must ask the engine for the
 * parent records it may not hold. The ask (a targeted requirement) is made only while the
 * handle is OWNED; a reader that outlives the owner (a deferred handle drawn while the next
 * query loads) keeps the local read and declares nothing (roadmap#423: readers never declare).
 */
function observeParentLookup(
	engine: RxdbSyncEngine,
	id: string,
	parentIds: number[],
	searchFields: string[] | undefined,
	owned$: Observable<boolean>
): Observable<ProductsResult> {
	if (parentIds.length === 0) return of(emptyResult());
	return new Observable<ProductsResult>((subscriber) => {
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
		let handles: RequirementHandle[] = [];
		const ownership = owned$.subscribe((owned) => {
			if (owned && handles.length === 0) {
				handles = declareRequirements(engine, requirements);
			} else if (!owned && handles.length > 0) {
				releaseHandles(handles);
				handles = [];
			}
		});
		const subscription = observeEngineQuery(engine, descriptor).subscribe(subscriber);
		return () => {
			subscription.unsubscribe();
			ownership.unsubscribe();
			releaseHandles(handles);
		};
	});
}

export type ProductsHandleInput = {
	state: QueryStateOf<'products'>;
	parentSearchFields: string[] | undefined;
	childSearchFields: string[] | undefined;
};

/**
 * The relational products read: a product is a hit when it matches the search, or when one of
 * its variations does (the variation's count rides on the hit as `childrenSearchCount`). Two
 * demands while a term is present (the parent window, the child search), one otherwise.
 */
export function acquireProductsQueryHandle(
	engine: RxdbSyncEngine,
	key: string,
	input: ProductsHandleInput
): QueryHandle<ProductsResult> {
	return acquireQueryHandle(engine, key, (registry) => {
		const id = `qh${nextHandleId++}`;
		const { state, parentSearchFields, childSearchFields } = input;
		const compiled = compileQuery('products', state, {
			id: `${id}:parent`,
			searchFields: parentSearchFields,
		});
		const descriptor: EngineQueryDescriptor = {
			collection: 'products',
			read: compiled.read,
			searchFields: parentSearchFields,
		};
		const search = compiled.read.search;
		const demands = [createDemand(engine, `${id}:parent`, demandPlanFor(compiled))];
		let result$: QueryHandleSpec<ProductsResult>['result$'];
		if (!search) {
			result$ = (target) => observeEngineQuery(target, descriptor);
		} else {
			const childDescriptor: EngineQueryDescriptor = {
				collection: 'variations',
				selector: state.filters.status ? { status: state.filters.status } : {},
				sort: [{ id: 'asc' }],
				search,
				searchFields: childSearchFields,
			};
			const childCompiled = compileQuery(
				'variations',
				{
					search,
					filters: {
						attributeMatches: [],
						...(state.filters.status ? { status: state.filters.status } : {}),
					},
					sort: { field: 'id', direction: 'asc' },
				},
				{ id: `${id}:child`, searchFields: childSearchFields }
			);
			demands.push(createDemand(engine, `${id}:child`, demandPlanFor(childCompiled)));
			result$ = (target, owned$) => {
				const direct$ = observeEngineQuery(target, {
					...descriptor,
					read: { ...compiled.read, limit: undefined },
				});
				const children$ = observeEngineQuery(target, childDescriptor);
				return combineLatest([direct$, children$]).pipe(
					switchMap(([direct, children]) => {
						const counts = new Map<number, number>();
						for (const hit of children.hits) {
							const parentId = Number(hit.record.payload.parent_id);
							if (Number.isFinite(parentId)) counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
						}
						const parentIds = [...counts.keys()];
						// The union is an ANSWER only once both search legs have answered —
						// a pending leg means the merged rows are still provisional (#1733).
						const searchAnswered =
							direct.searchState === 'answered' && children.searchState === 'answered';
						return observeParentLookup(
							target,
							`${id}:lookup`,
							parentIds,
							descriptor.searchFields,
							owned$
						).pipe(map((lookup) => ({ direct, lookup, counts, searchAnswered })));
					}),
					switchMap(({ direct, lookup, counts, searchAnswered }) => {
						const uuids = [...new Set([...direct.hits, ...lookup.hits].map((hit) => hit.id))];
						return observeEngineQuery(target, {
							...descriptor,
							read: { ...compiled.read, search: '' },
							selector: { uuid: { $in: uuids } },
						}).pipe(
							map((result) => ({
								...result,
								searchActive: true,
								searchState: searchAnswered ? ('answered' as const) : ('pending' as const),
								hits: result.hits.map((hit) => {
									const wooId = Number(hit.record.payload.id);
									return {
										...hit,
										childrenSearchCount: counts.get(wooId) ?? 0,
										parentSearchTerm: search,
									};
								}),
							}))
						);
					})
				);
			};
		}
		return createQueryHandle(
			engine,
			{
				key,
				result$,
				demands,
				activeCollections: ['products', 'variations'],
				censusScoped: compiled.censusScoped,
				coverage: compiled.coverage,
				observeActive: observeCollectionActive,
			},
			emptyResult(),
			registry
		);
	});
}

/**
 * One string per query, whatever order a caller built the state in: keys sorted at every
 * level, `undefined` dropped, the search trimmed. Two components describing the same query
 * (the grid seeds `{ status, stock_status }`, the quick-filter preview patches filters one by
 * one) then share one handle instead of running two reads and two demands.
 */
export function canonicalQueryKey(value: unknown): string {
	return JSON.stringify(value, (_key, entry: unknown) => {
		if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
			const sorted: Record<string, unknown> = {};
			for (const name of Object.keys(entry as Record<string, unknown>).sort()) {
				const field = (entry as Record<string, unknown>)[name];
				if (field !== undefined) sorted[name] = field;
			}
			return sorted;
		}
		return entry;
	});
}

type CollectionHandleKey = Exclude<CollectionKey, 'logs'>;

export type CollectionHandleInput<C extends CollectionHandleKey> = {
	collection: C;
	state: QueryStateOf<C>;
	remoteIds?: readonly RemoteId[];
	storeScope: 'pos' | 'sales';
	searchFields: string[] | undefined;
};

/** What a plain engine read is built from: the descriptor it reads, the query it demands. */
export type EngineQueryHandleInput = {
	descriptor: EngineQueryDescriptor;
	compiled: CompiledQuery;
	/** Not live: re-check at most this often after a write (see `recheckedRead$`). */
	recheckMs?: number;
};

/**
 * A read answered once, then asked again at most once per `windowMs` after its collection is
 * written — never a live query, whose every write re-runs it. A write starts the window; more
 * writes inside it are the same re-check, and the answer converges at the window's end. A new
 * database (scope move, reset) is asked at once.
 */
function recheckedRead$<T>(
	read$: Observable<T>,
	collection$: Observable<{ eventBulks$: Observable<unknown> } | null>,
	windowMs: number
): Observable<T> {
	const once$ = defer(() => read$.pipe(take(1)));
	return collection$.pipe(
		distinctUntilChanged(),
		switchMap((collection) =>
			collection
				? merge(
						once$,
						collection.eventBulks$.pipe(
							auditTime(windowMs),
							exhaustMap(() => once$)
						)
					)
				: once$
		)
	);
}

/**
 * One descriptor read with one demand as a handle: the collection's own activity and census,
 * the compiled query's coverage. `build` runs on a registry miss, and a handle enters the
 * registry only when it starts (its owner's retain), so two acquires of one key before the
 * first owner's effect each build; the later handle then mirrors the first at start. `build`
 * is handed the handle's id, which its demand declares under.
 */
export function acquireEngineQueryHandle(
	engine: RxdbSyncEngine,
	key: string,
	build: (id: string) => EngineQueryHandleInput
): QueryHandle<QueryResult<RxCollection>> {
	return acquireQueryHandle(engine, key, (registry) => {
		const id = `qh${nextHandleId++}`;
		const { descriptor, compiled, recheckMs } = build(id);
		const engineCollection = engineCollectionNameFor(compiled.collection);
		const search = (descriptor.read?.search ?? descriptor.search)?.trim();
		return createQueryHandle(
			engine,
			{
				key,
				result$: (target) => {
					const live$ = observeEngineQuery(target, descriptor).pipe(
						map((result) => ({ ...result, searchActive: Boolean(search) }))
					);
					return recheckMs === undefined
						? live$
						: recheckedRead$(
								live$,
								observeEngineDatabases(target).pipe(
									map((database) => database?.collections[engineCollection] ?? null)
								),
								recheckMs
							);
				},
				demands: [createDemand(engine, id, demandPlanFor(compiled))],
				activeCollections: [engineCollection],
				censusScoped: compiled.censusScoped,
				coverage: compiled.coverage,
				observeActive: observeCollectionActive,
			},
			emptyResult(),
			registry
		);
	});
}

/**
 * A handle with nothing to ask: no engine read (its answer is the empty result), no demand, no
 * activity. What a disabled read hands its readers, so they keep one shape — a disabled read's
 * empty answer IS its answer. Like any handle it is unanswered (`ready: false`) until its first
 * reader or owner starts it; it answers on that start, synchronously.
 */
export function acquireEmptyQueryHandle(
	engine: RxdbSyncEngine,
	key: string
): QueryHandle<QueryResult<RxCollection>> {
	return acquireQueryHandle(engine, key, (registry) =>
		createQueryHandle(
			engine,
			{
				key,
				result$: () => of(emptyResult()),
				demands: [],
				activeCollections: [],
				censusScoped: false,
				observeActive: observeCollectionActive,
			},
			emptyResult(),
			registry
		)
	);
}

/**
 * A demand and nothing to read: the standing declaration while owned, its readiness and re-arm
 * (`whenReady`, `declareOnce`), and the collection's pull activity (`value.active`). For a caller
 * that scans the residents itself once the demand has landed (the coupon replay), so it holds no
 * live query over a whole collection, and no census or coverage verdict, for nothing; its answer
 * is the empty result and its `total` is null.
 */
export function acquireDemandQueryHandle(
	engine: RxdbSyncEngine,
	key: string,
	build: (id: string) => CompiledQuery
): QueryHandle<QueryResult<RxCollection>> {
	return acquireQueryHandle(engine, key, (registry) => {
		const id = `qh${nextHandleId++}`;
		const compiled = build(id);
		return createQueryHandle(
			engine,
			{
				key,
				result$: () => of(emptyResult()),
				demands: [createDemand(engine, id, demandPlanFor(compiled))],
				activeCollections: [engineCollectionNameFor(compiled.collection)],
				censusScoped: false,
				// Nothing reads a total from a demand: no census, no coverage verdict.
				projectsTotal: false,
				observeActive: observeCollectionActive,
			},
			emptyResult(),
			registry
		);
	});
}

/**
 * The plain collection read as a handle: one
 * descriptor, one demand, the collection's own activity and census. Orders, customers, coupons,
 * tax rates, refunds, variations: every table screen's query.
 */
export function acquireCollectionQueryHandle<C extends CollectionHandleKey>(
	engine: RxdbSyncEngine,
	key: string,
	input: CollectionHandleInput<C>
): QueryHandle<QueryResult<RxCollection>> {
	return acquireEngineQueryHandle(engine, key, (id) => {
		const { collection, state, remoteIds, storeScope, searchFields } = input;
		const compiled = compileQuery(collection, state, {
			id,
			targeted: remoteIds,
			storeScope,
			searchFields,
		});
		return {
			compiled,
			descriptor: {
				collection: compiled.collection,
				searchFields,
				read: { ...compiled.read, searchFields },
			},
		};
	});
}

/**
 * The handle for a collection's query state, retained while the caller is mounted: keyed by
 * scope, state, targeted ids, store scope and search fields, so two screens asking the same
 * question share one read and one demand.
 */
export function useCollectionQueryHandle<C extends CollectionHandleKey>(
	collection: C,
	state: QueryStateOf<C>,
	options: { remoteIds?: readonly RemoteId[]; storeScope?: 'pos' | 'sales' } = {}
): QueryHandle<QueryResult<RxCollection>> {
	const { engine } = useQueryRuntime();
	const legacy = (collection === 'tax-rates' ? 'taxes' : collection) as Parameters<
		typeof useScopeKey
	>[0];
	const scope = useScopeKey(legacy);
	const searchFields = useSearchFields(legacy) as string[] | undefined;
	const storeScope = options.storeScope ?? 'pos';
	const key = canonicalQueryKey([
		collection,
		scope,
		storeScope,
		{ ...state, search: (state as { search?: string }).search?.trim() },
		options.remoteIds ?? null,
		searchFields ?? null,
	]);
	const handle = React.useMemo(() => {
		const [, , , canonical, remoteIds, fields] = JSON.parse(key) as [
			string,
			string,
			string,
			QueryStateOf<C>,
			RemoteId[] | null,
			string[] | null,
		];
		return acquireCollectionQueryHandle(engine, key, {
			collection,
			state: canonical,
			remoteIds: remoteIds ?? undefined,
			storeScope,
			searchFields: fields ?? undefined,
		});
	}, [collection, engine, key, storeScope]);
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}

function idSet(ids: readonly number[] | undefined): number[] {
	return [...new Set(ids ?? [])].sort((a, b) => a - b);
}

/**
 * The products handle for a query state, retained while the caller is mounted.
 *
 * The key is the state's canonical JSON under both scope keys (products and variations: a
 * generation bump on either is a new handle, declared before the old one releases) and the
 * search-field lists. A deep-equal state is the same key, so the handle survives a parent's
 * render handing down a fresh-but-equal object, which is what `useStableDescriptor` used to
 * approximate per hook.
 */
export function useProductsQueryHandle(
	state: QueryStateOf<'products'>
): QueryHandle<ProductsResult> {
	const { engine } = useQueryRuntime();
	const productsScope = useScopeKey('products');
	const variationsScope = useScopeKey('variations');
	const parentSearchFields = useSearchFields('products') as string[] | undefined;
	const childSearchFields = useSearchFields('variations') as string[] | undefined;
	const key = canonicalQueryKey([
		'products',
		productsScope,
		variationsScope,
		{
			...state,
			search: state.search.trim(),
			filters: {
				...state.filters,
				// Term membership is a set: the translator dedupes and sorts these before they
				// reach the engine, so their selection order is not part of the query's identity.
				categories: idSet(state.filters.categories),
				tags: idSet(state.filters.tags),
				brands: idSet(state.filters.brands),
			},
		},
		parentSearchFields ?? null,
		childSearchFields ?? null,
	]);
	const handle = React.useMemo(() => {
		const [, , , canonical, parent, child] = JSON.parse(key) as [
			string,
			string,
			string,
			QueryStateOf<'products'>,
			string[] | null,
			string[] | null,
		];
		return acquireProductsQueryHandle(engine, key, {
			state: canonical,
			parentSearchFields: parent ?? undefined,
			childSearchFields: child ?? undefined,
		});
	}, [engine, key]);
	// The owner retains: the demand is declared while this screen holds the handle; readers
	// (the grid, a footer, a count badge) come and go and only keep the read.
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}

/**
 * The logs ledger's handle: a local query (the logs live in the store database, never the
 * engine), so no demand, no activity, no census. Its total is the result's own `count` — the
 * local count of every matching row, which IS the whole set for a local-only collection; the
 * handle's `total` stays null (it is read only from a demand's coverage).
 *
 * One handle per local read, outside the registry: a store switch hands `useLocalQuery$` a new
 * database and so a new observable, and a new observable is a new handle. (A storage recovery
 * does not: the observable follows the replacement collection itself, through `reset$`.) Only
 * the observable is built here, so the handle's retain is what runs the read.
 */
export function useLogsQueryHandle(
	state: QueryStateOf<'logs'>
): QueryHandle<QueryResult<RxCollection>> {
	const { engine } = useQueryRuntime();
	const translated = translateLogsQueryState(state);
	const key = canonicalQueryKey(['logs', translated]);
	const { result$ } = useLocalQuery$({
		collectionName: 'logs',
		selector: translated.selector,
		sort: translated.sort,
		limit: translated.limit,
		search: translated.search,
	});
	const handle = React.useMemo(
		() =>
			createQueryHandle(
				engine,
				{
					key,
					result$: () => result$ as unknown as Observable<QueryResult<RxCollection>>,
					demands: [],
					activeCollections: [],
					censusScoped: false,
					observeActive: observeCollectionActive,
				},
				emptyResult()
			),
		[engine, key, result$]
	);
	// The screen owns the read; the ledger draws it inside its boundary.
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}

/** Read a handle's snapshot and re-render when it changes: one subscription, one object. */
export function useQueryHandleValue<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): Readonly<QuerySnapshot<R>> {
	const getSnapshot = React.useCallback(() => handle.value, [handle]);
	return React.useSyncExternalStore(handle.subscribe, getSnapshot, getSnapshot);
}

/** The fields a reader re-renders for; the answer itself (`ready`, `error`, `result`) always. */
const EVERY_FIELD: SnapshotFields = [
	'active',
	'pending',
	'exhausted',
	'total',
	'laneProgress',
	'count',
	'searchActive',
	'searchState',
];
export type SnapshotFields = readonly (keyof QuerySnapshot<QueryResult<RxCollection>>)[];
const ANSWER_FIELDS: SnapshotFields = ['ready', 'error', 'result'];

/**
 * `useQueryHandleValue` for a reader that cares about SOME fields: the snapshot it holds moves
 * only when the answer or one of `fields` does. One snapshot still carries everything, so the
 * grid body can stay put while the sync spinner flips `active` and the footer, reading
 * `['active', 'total']` itself, follows it.
 */
export function useQueryHandleFields<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>,
	fields: SnapshotFields
): Readonly<QuerySnapshot<R>> {
	const last = React.useRef<Readonly<QuerySnapshot<R>> | null>(null);
	// A reader's list is a constant; its contents are the dependency, not its identity.
	const watched = fields.join(',');
	const getSnapshot = React.useCallback(() => {
		const current = handle.value;
		const held = last.current;
		if (
			held &&
			ANSWER_FIELDS.every((field) => held[field] === current[field]) &&
			watched
				.split(',')
				.every(
					(field) => held[field as keyof typeof held] === current[field as keyof typeof current]
				)
		) {
			return held;
		}
		last.current = current;
		return current;
	}, [handle, watched]);
	return React.useSyncExternalStore(handle.subscribe, getSnapshot, getSnapshot);
}

/**
 * The handle a stale-while-loading reader draws: the previous handle while a changed one is
 * still unanswered (React's `useDeferredValue`), and the changed one as soon as the previous
 * handle has failed since. A superseded handle's failure must not reach the boundary over a
 * healthy query: the boundary's keys moved on with the healthy render, so nothing would clear
 * the fallback once the new handle answered. On that failure the reader suspends on the live
 * handle instead (the fallback, not the old failure), and draws its answer.
 */
export function useDrawnHandle<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): QueryHandle<R> {
	const deferred = React.useDeferredValue(handle);
	const superseded = deferred !== handle;
	// Subscribed, not peeked: the previous handle's failure is what moves the reader on.
	const failed = React.useSyncExternalStore(
		deferred.subscribe,
		() => deferred.value.error !== null,
		() => deferred.value.error !== null
	);
	return superseded && failed ? handle : deferred;
}

/**
 * A ready snapshot, or a suspension: the reader's one hook (roadmap#423).
 *
 * Suspense-native. While the handle has no answer the reader throws `handle.whenAnswered()`,
 * one stable promise per handle, and the nearest boundary draws its fallback; the owner's
 * retain (an effect above the boundary) is what starts the read, so nothing subscribes during
 * render. A failed read is thrown to the boundary. Stale-while-loading is React's own: a reader
 * that renders `useDrawnHandle(handle)` keeps the previous handle's rows on screen while the
 * new one suspends (`drawn !== handle` is "settling", and is pending for paging).
 *
 * A boundary reset remounts the reader over the same failure; the owner's boundary wires
 * `onReset={() => handle.retry()}` so the reset asks the engine again and the reader suspends
 * on the retry instead of throwing the old failure back.
 *
 * One constraint: the owner must COMMIT for the promise to settle, since its retain effect is
 * what starts the read. Every handle input today (the query-state store, the scope key) arrives
 * through `useSyncExternalStore`, whose updates are synchronous, so the owner always commits.
 * A handle input delivered inside a transition would suspend the reader within that transition
 * on an already-revealed boundary, and the owner's effect would wait on a commit that waits on
 * the reader: do not feed a handle from a transition.
 */
export function useQuerySnapshot<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>,
	/** Re-render for these fields beside the answer; every field when omitted. */
	fields?: SnapshotFields
): Readonly<QuerySnapshot<R>> {
	const snapshot = useQueryHandleFields(handle, fields ?? EVERY_FIELD);
	if (snapshot.error) throw snapshot.error;
	if (!snapshot.ready) throw handle.whenAnswered();
	return snapshot;
}
