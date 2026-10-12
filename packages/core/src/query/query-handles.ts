/**
 * Query handles for the screens: the React edge of `@wcpos/query`'s handle primitive, and the
 * first handle factory, the relational products read (roadmap#423).
 *
 * A screen asks for a handle by query state; the key is the state's canonical JSON under the
 * collection's scope key, so the same query from two components (the grid and the quick-filter
 * preview) is one handle, and a parent's render, a store tick or a clock cannot re-issue it.
 * The owning component retains the handle while mounted; readers subscribe to it with
 * `useQueryHandleValue` (one subscription, one snapshot) or gate on `useQueryHandleResource`.
 */

import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { combineLatest, distinctUntilChanged, filter, map, Observable, of, switchMap } from 'rxjs';

import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	declareRequirements,
	type DemandPlan,
	engineCollectionNameFor,
	type EngineQueryDescriptor,
	observeCollectionActive,
	observeEngineQuery,
	type QueryHandle,
	queryHandleResource,
	queryHandleResults$,
	type QueryResult,
	type QuerySnapshot,
	releaseHandles,
	useQueryRuntime,
	useSearchFields,
} from '@wcpos/query';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { compileQuery, requirementsForCompiledQuery } from './query-state-translator';
import { useScopeKey } from './scope-key';

import type { QueryStateOf } from './query-state-types';
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

function observeParentLookup(
	engine: RxdbSyncEngine,
	id: string,
	parentIds: number[],
	searchFields: string[] | undefined
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
		const handles = declareRequirements(engine, requirements);
		const subscription = observeEngineQuery(engine, descriptor).subscribe(subscriber);
		return () => {
			subscription.unsubscribe();
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
		let result$: (engine: RxdbSyncEngine) => Observable<ProductsResult>;
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
			result$ = (target) => {
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
							descriptor.searchFields
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

const noop = () => undefined;

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
	// The owner retains: readers come and go (a footer, a count badge), the declaration stays.
	React.useEffect(() => handle.subscribe(noop), [handle]);
	return handle;
}

/** Read a handle's snapshot and re-render when it changes: one subscription, one object. */
export function useQueryHandleValue<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): Readonly<QuerySnapshot<R>> {
	const getSnapshot = React.useCallback(() => handle.value, [handle]);
	return React.useSyncExternalStore(handle.subscribe, getSnapshot, getSnapshot);
}

/**
 * The snapshot a screen should DRAW: the handle's own once it has answered, and until then the
 * last answered snapshot this component drew — so a changed query (a keystroke, an extended
 * limit) keeps the current rows on screen while the next read loads instead of flashing the
 * loading state, which is what the Suspense resource's `reload` did. `settling` says the drawn
 * snapshot is not yet the current handle's answer. Before any answer, `value.ready` is false and
 * the screen shows its loading state: the gate that used to be a Suspense boundary.
 */
export function useQueryHandleView<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): { value: Readonly<QuerySnapshot<R>>; settling: boolean } {
	const current = useQueryHandleValue(handle);
	// What the previous handle had answered when this one took over — kept per handle, so a
	// snapshot change on the SAME handle never re-renders through state (a handle never goes
	// from answered back to unanswered). Derived during render, React's documented pattern.
	const [held, setHeld] = React.useState<{
		handle: QueryHandle<R>;
		last: Readonly<QuerySnapshot<R>> | null;
	}>({ handle, last: null });
	let last = held.last;
	if (held.handle !== handle) {
		last = held.handle.value.ready ? held.handle.value : held.last;
		setHeld({ handle, last });
	}
	// An answer or a failure is always the current handle's; the grid rethrows the failure.
	const value = current.ready || current.error ? current : (last ?? current);
	return { value, settling: value !== current };
}

/**
 * The eight-observable `QueryBinding` shape over a handle, for the shared consumers that still
 * take it (the data table, the browse stage's footers). The Suspense resource is created on
 * first access, not on mount — a grid that reads the snapshot never builds one, so nothing
 * subscribes during render on that path — and it reloads (keeps its rows) when the handle moves.
 */
export function useQueryBindingFor<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): {
	resource: ObservableResource<R>;
	result$: Observable<R>;
	active$: Observable<boolean>;
	pending$: Observable<boolean>;
	exhausted$: Observable<boolean | null>;
	total$: Observable<number | null>;
	laneProgress$: Observable<QuerySnapshot<R>['laneProgress']>;
	sync: () => Promise<void>;
} {
	const held = React.useRef<{ handle: QueryHandle<R>; resource: ObservableResource<R> } | null>(
		null
	);
	React.useEffect(() => {
		// The resource follows the handle in an effect, never in a reader's render (a reload
		// subscribes the new read on the spot, and a live shared handle would then emit into the
		// table's Suspense state while another component renders). Until the effect runs, a
		// reader gets the resource as it is — the previous rows, which is what `reload` keeps.
		// It follows even if nobody reads it again (the view switched from table to grid), or it
		// would retain that handle for good.
		const current = held.current;
		if (!current || current.handle === handle) return;
		current.resource.reload(queryHandleResults$(handle));
		held.current = { handle, resource: current.resource };
	}, [handle]);
	React.useEffect(
		() => () => {
			held.current?.resource.destroy();
			held.current = null;
		},
		[]
	);
	return React.useMemo(
		() => ({
			get resource() {
				// Built on first access only; a reader that never asks (the grid) never subscribes.
				if (!held.current) held.current = { handle, resource: queryHandleResource(handle) };
				return held.current.resource;
			},
			...bindingObservablesFor(handle),
		}),
		[handle]
	);
}

/**
 * A Suspense resource over a handle, owned by the calling component: it suspends until the
 * engine's first answer, and when the handle changes it RELOADS rather than re-suspends, so
 * the current rows stay rendered while the next query loads (the extended-limit case).
 */
export function useQueryHandleResource<R extends QueryResult<RxCollection>>(
	handle: QueryHandle<R>
): ObservableResource<R> {
	const [resource] = React.useState(() => queryHandleResource(handle));
	const bound = React.useRef(handle);
	React.useEffect(() => {
		if (bound.current === handle) return;
		bound.current = handle;
		resource.reload(queryHandleResults$(handle));
	}, [handle, resource]);
	React.useEffect(() => () => resource.destroy(), [resource]);
	return resource;
}

/**
 * The eight-observable `QueryBinding` shape over a handle, for the shared consumers that
 * still take it (the data table, the footers, the paging verdict). Each observable retains
 * the handle while subscribed and projects one field of the snapshot. Built once per handle,
 * so a binding's identity is the handle's.
 */
export function bindingObservablesFor<R extends QueryResult<RxCollection>>(handle: QueryHandle<R>) {
	const snapshot$ = handle.observe();
	// The projections say nothing until the read has answered: a footer holding the previous
	// query's total keeps it while the next loads (as the old per-binding streams did, which
	// emitted nothing before their read), instead of blanking to "Showing 20" per keystroke.
	const answered$ = snapshot$.pipe(filter((snapshot) => snapshot.ready));
	const field = <K extends keyof QuerySnapshot<R>>(source: Observable<QuerySnapshot<R>>, name: K) =>
		source.pipe(
			map((snapshot) => snapshot[name]),
			distinctUntilChanged()
		);
	return {
		result$: queryHandleResults$(handle),
		active$: field(snapshot$, 'active'),
		pending$: field(snapshot$, 'pending'),
		exhausted$: field(answered$, 'exhausted'),
		total$: field(answered$, 'total'),
		laneProgress$: answered$.pipe(
			map((snapshot) => snapshot.laneProgress),
			distinctUntilChanged(
				(previous, current) =>
					previous?.downloaded === current?.downloaded && previous?.total === current?.total
			)
		),
		sync: handle.sync,
	};
}
