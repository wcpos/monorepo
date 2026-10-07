import * as React from 'react';

import isEqual from 'lodash/isEqual';

import { useDocField } from '@wcpos/query';

import { usePersistedState } from '../../../../../../contexts/persisted-state';
import { useQueryState, useQueryStateActions } from '../../../../../../query';
import { useUISettings } from '../../../../contexts/ui-settings';
import { quickFilterHolds, quickFilterToQueryPatch } from '../../filter-bar/apply-quick-filter';
import { getPOSProductSort } from '../../pos-product-sort';
import { type BrowseBy, type BrowseTerm, termKey } from './browse-source';

import type { Measurable } from '../deal-stack';
import type { QueryStateActions, QueryStateOf } from '../../../../../../query';
import type { FiltersOf } from '../../../../../../query/query-state-types';
import type { QuickFilter } from '../../filter-bar/filter-bar-layout';
import type { BrowseTerms } from './use-browse-terms';

/** `kind` so a DealStack's staged detail can be told from a product drill. */
export type PathEntry = { kind: 'term'; term: BrowseTerm; target?: Measurable };
export type BrowsePath = {
	/** The live path: entries whose projection the root query still carries. [] at the root. */
	path: PathEntry[];
	/**
	 * Open `term` at `depth` (the depth of the level it was tapped on: 0 at the root) and project
	 * it — the path below that depth is replaced, so a second tap before the first level is on
	 * stage opens the term tapped, never one nested under the other. Omitted: push.
	 */
	enter: (term: BrowseTerm, target?: Measurable, depth?: number) => void;
	/** Keep path[0..depth), re-project. */
	backTo: (depth: number) => void;
	/** backTo(0). */
	root: () => void;
};

export type TaxonomyField = 'categories' | 'tags' | 'brands';
/**
 * What the path put into the query, so that exactly that can be taken back out. Only the
 * source's own field: the crumb is the place, the pills are the conditions (the filters and
 * breadcrumbs page, 2026-09-17), so a pill pressed inside a level narrows the level and is
 * never part of what the path owns. All products puts nothing in (it only clears the source's
 * own field).
 */
type Projection =
	| { kind: 'taxonomy'; field: TaxonomyField; ids: number[] }
	| { kind: 'all' }
	| { kind: 'shortcut'; quickFilter: QuickFilter };

/**
 * No search, as the query compiler reads it: it trims the term, so a whitespace-only search
 * searches for nothing and must not displace the term set or drop the path.
 */
export function isBlankSearch(search: string): boolean {
	return search.trim() === '';
}

const isEmptyFilter = (value: unknown) =>
	value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * True when the filters are exactly the provider's initial filters: every key, live or initial,
 * either equals its initial value or is empty on both sides (unset, an empty string, an empty
 * list). Symmetric: an initial key the live filters no longer carry (the default In-stock pill
 * cleared, which deletes `stock_status`) broadens the query, and that is not the baseline either.
 */
export function filtersAtBaseline(
	filters: Record<string, unknown>,
	initialFilters: Record<string, unknown>
): boolean {
	const keys = new Set([...Object.keys(filters), ...Object.keys(initialFilters)]);
	return [...keys].every((key) => {
		const value = filters[key];
		const initial = initialFilters[key];
		if (isEmptyFilter(value) && isEmptyFilter(initial)) return true;
		return key in initialFilters && sameFilterValue(value, initial);
	});
}

/**
 * One filter value against another: an id list is a set (the query reads it as one, and a
 * shortcut's liveness compares it as one), anything else by value.
 */
export function sameFilterValue(left: unknown, right: unknown): boolean {
	if (Array.isArray(left) && Array.isArray(right))
		return left.length === right.length && right.every((id) => left.includes(id));
	return JSON.stringify(left) === JSON.stringify(right);
}

export function taxonomyField(source: BrowseBy): 'categories' | 'tags' | 'brands' | null {
	return source === 'categories' || source === 'tags' || source === 'brands' ? source : null;
}

const NO_PATH: PathEntry[] = [];

const sameSet = (left: unknown, right: number[]) =>
	Array.isArray(left) && left.length === right.length && right.every((id) => left.includes(id));
export const sameSort = (
	left: { field: string; direction: string },
	right: { field: string; direction: string }
) => left.field === right.field && left.direction === right.direction;

/**
 * The baseline sort: the one the device's `pos-products` settings persist — exactly what the
 * chip reads (filter-bar.tsx QuickChip), and what a table header writes (index.tsx), so a
 * header sort moves the baseline with it. The ONE derivation for the path (a shortcut's level
 * and its reset) and the stage (a sort-only chip displaces the root from this, as a pill does).
 */
export function useSettingsSort(): QueryStateOf<'products'>['sort'] {
	const { uiSettings } = useUISettings('pos-products');
	return useDocField(uiSettings, (value) => getPOSProductSort(value.sortBy, value.sortDirection));
}

/**
 * Whether anything but the search moved since the path was last live — any filter, the
 * projected ones included, or the sort. A typed search moves only the search; a pill on the
 * source's own field, a chip or Clear filters moves something else, and the query is then theirs.
 */
function movedBesidesSearch(
	now: { filters: FiltersOf<'products'>; sort: { field: string; direction: string } },
	before: { filters: FiltersOf<'products'>; sort: { field: string; direction: string } }
): boolean {
	return !isEqual(now.filters, before.filters) || !sameSort(now.sort, before.sort);
}

/**
 * Every stored term is still in the source, the first is still a root (its parent absent or
 * not in the source), and each later one is still the child of the one before. Unknown — the
 * source unanswered, or its list held while an existence read is pending (a term that has just
 * dropped to zero count is not in it yet) — is not gone: the chain stands.
 */
function chainStands(stored: PathEntry[], terms: Pick<BrowseTerms, 'all' | 'pending'>): boolean {
	const { all } = terms;
	if (all === undefined || terms.pending) return true;
	const ids = new Set(all.map((candidate) => (candidate.kind === 'term' ? candidate.id : -1)));
	let previous: number | undefined;
	for (const { term } of stored) {
		if (term.kind !== 'term') continue;
		const known = all.find((candidate) => termKey(candidate) === termKey(term));
		if (!known || known.kind !== 'term') return false;
		if (
			previous === undefined ? !!known.parent && ids.has(known.parent) : known.parent !== previous
		)
			return false;
		previous = known.id;
	}
	return true;
}

/**
 * Take back out of the query exactly what a projection put in, and only what is still there: a
 * pill the cashier pressed inside the level is theirs and stays. A key the baseline owns
 * (status, stock_status under the device setting) goes back to its baseline value, not away: a
 * shortcut on in-stock must not leave out-of-stock on.
 */
function takeOutProjection(
	current: Projection,
	now: {
		search: string;
		filters: FiltersOf<'products'>;
		sort: { field: string; direction: string };
	},
	act: Pick<QueryStateActions<'products'>, 'clearFilter' | 'setFilter' | 'clearSearch' | 'setSort'>,
	baseline: { filters: Partial<FiltersOf<'products'>>; sort: QueryStateOf<'products'>['sort'] }
): void {
	// All products put nothing into the query: there is nothing to take back out.
	if (current.kind === 'all') return;
	if (current.kind === 'taxonomy') {
		if (sameSet(now.filters[current.field], current.ids)) act.clearFilter(current.field);
		return;
	}
	const patch = quickFilterToQueryPatch(current.quickFilter);
	for (const [key, value] of Object.entries(patch.filters)) {
		const field = key as keyof FiltersOf<'products'>;
		if (!isEqual(now.filters[field], value)) continue;
		const base = baseline.filters[field];
		if (base !== undefined && !(Array.isArray(base) && base.length === 0))
			act.setFilter(field, base as never);
		else act.clearFilter(field);
	}
	// As the liveness reads it (trimmed): a space typed after the shortcut's search is still its
	// search, and leaving must take it out.
	if (patch.search && now.search.trim() === patch.search.trim()) act.clearSearch();
	if (current.quickFilter.sort && sameSort(now.sort, current.quickFilter.sort))
		act.setSort(baseline.sort.field, baseline.sort.direction);
}

/** The projection store, persisted with the path when the stage is (see `useBrowsePath`). */
function useProjectionStore(persistKey: string | undefined) {
	return usePersistedState(persistKey && `${persistKey}:projection`, () =>
		createStore<Projection | null>(null)
	);
}

/**
 * All products mode (no browse stage mounted) releasing a persisted projection: the stage that
 * made it was unmounted without taking it out (a persisted path never is, see `useBrowsePath`),
 * so the catalogue would stay narrowed to the last term, with its ids lit on the Category
 * pill. Takes the projection out, before paint, and forgets the path. `release` false: nothing.
 */
export function useReleaseBrowsePath(persistKey: string | undefined, release: boolean): void {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const resetState = useBrowseResetState();
	const pathStore = usePathStore(persistKey);
	const projected = useProjectionStore(persistKey);
	const latest = React.useRef({ state, actions, resetState });
	React.useLayoutEffect(() => {
		latest.current = { state, actions, resetState };
	});
	React.useLayoutEffect(() => {
		if (!release) return;
		const current = projected.get();
		if (current) {
			const { state: now, actions: act, resetState: baseline } = latest.current;
			takeOutProjection(current, now, act, baseline);
			projected.set(null);
		}
		if (pathStore.get().entries.length > 0) pathStore.set({ source: 'all', entries: NO_PATH });
	}, [release, projected, pathStore]);
}

/**
 * The device baseline a projection is taken out against: the filters `resetFilters` restores
 * (published; in stock unless the setting shows out-of-stock) and the persisted settings sort.
 * The ONE derivation, for the path and for All products mode releasing a leftover (a shortcut
 * on in-stock must leave the baseline's in-stock in place, never delete it).
 */
function useBrowseResetState(): {
	filters: Partial<FiltersOf<'products'>>;
	sort: QueryStateOf<'products'>['sort'];
} {
	const { uiSettings } = useUISettings('pos-products');
	const settingsSort = useSettingsSort();
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	return React.useMemo(
		() => ({
			filters: {
				categories: [],
				tags: [],
				brands: [],
				status: 'publish' as const,
				...(showOutOfStock ? {} : { stock_status: 'instock' as const }),
			},
			sort: settingsSort,
		}),
		[showOutOfStock, settingsSort]
	);
}

function usePathStore(persistKey: string | undefined) {
	return usePersistedState(persistKey && `${persistKey}:path`, () =>
		createStore<{ source: BrowseBy; entries: PathEntry[] }>({ source: 'all', entries: NO_PATH })
	);
}

/**
 * A value written by handlers, effects and cleanups and read by the render through
 * `useSyncExternalStore` — a ref's value may not be read while rendering. Two of them: what the
 * stored path has put into the query (the projection), and the stored path itself. Both render
 * at the query's own (sync) priority, so a move of the path, its projection and the query lands
 * in ONE render whoever calls it (see the batching invariant at `enter`).
 */
function createStore<T>(initial: T) {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (next: T) => {
			if (next === value) return;
			value = next;
			listeners.forEach((listener) => listener());
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/**
 * The browse path and its projection into the ONE products query. The path is state, but what
 * is SHOWN is the path only while the query still carries what the path put there: a search,
 * a pill on the source's own field, Clear filters, or a quick-filter chip all move the query,
 * and the path falls away on the same render — the guard the variations drill-in already
 * applies to search. Every OTHER pill (stock, featured, on sale, another taxonomy) narrows the
 * level in place: the crumb is the place, the pills are the conditions (owner, 2026-10-07).
 *
 * `persistKey`: keep the path and its projection across remounts of the stage under a
 * `PersistedStateProvider` (the register's layout switching trees at the phone boundary), as
 * the products query itself is kept — a path over a query that survived must survive with it,
 * or the new mount would read the term's ids as a Category pill and show the flat list.
 */
export function useBrowsePath(
	source: Exclude<BrowseBy, 'all'>,
	terms: BrowseTerms,
	persistKey?: string
): BrowsePath {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	// Exactly what the chip reads (filter-bar.tsx QuickChip), so a shortcut is active for the
	// path when its chip's filters and search hold (its sort aside, once entered — see below).
	const settingsSort = useSettingsSort();
	const resetState = useBrowseResetState();
	const field = taxonomyField(source);
	// The path is the SOURCE's: a path stored under Categories is nothing under Tags from the very
	// render the source changes (the cleanup below then takes its projection out).
	// An external store, not state: `backTo` from Android's back (a device event, outside React's
	// event system) wrote the query at sync priority and a `useState` path at default priority, so
	// for one commit the child level stood on the path over the parent's products (review of the
	// Android follow-on, 2026-10-07). Read like the query, the path moves with it.
	const pathStore = usePathStore(persistKey);
	// A path handed to a new mount came with the tiles of the old one: a dealt level's way back
	// measures its entry's `target`, and those nodes are gone. Stripped once, as this mount
	// starts, before anything subscribes (the mount that wrote them has unmounted).
	React.useState(() => {
		const current = pathStore.get();
		if (current.entries.some((entry) => entry.target !== undefined))
			pathStore.set({
				...current,
				entries: current.entries.map(({ target: _gone, ...entry }) => entry),
			});
		return null;
	});
	const storedFor = React.useSyncExternalStore(pathStore.subscribe, pathStore.get, pathStore.get);
	const stored = storedFor.source === source ? storedFor.entries : NO_PATH;
	const setStored = React.useCallback(
		(update: PathEntry[] | ((current: PathEntry[]) => PathEntry[])) => {
			const current = pathStore.get();
			pathStore.set({
				source,
				entries:
					typeof update === 'function'
						? update(current.source === source ? current.entries : NO_PATH)
						: update,
			});
		},
		[source, pathStore]
	);
	const projected = useProjectionStore(persistKey);
	const projection = React.useSyncExternalStore(projected.subscribe, projected.get, projected.get);
	// The result window each covered level had when a child was opened over it, by entry identity
	// (as the stage keeps a gathering level's children): a parent paged past its first window must
	// get that window back on the way back, not the base page — every result change (`setFilter`)
	// resets the window, and a held snapshot replaced by the first page would shrink the mounted
	// list at its old scroll offset. Never read while rendering.
	const [windows] = React.useState(() => new WeakMap<PathEntry, number>());
	// The last committed query, for the handlers and cleanups below. Kept in a layout effect
	// declared before every other one, so the drop effect reads this commit's query.
	const latest = React.useRef({ state, actions, resetState });
	React.useLayoutEffect(() => {
		latest.current = { state, actions, resetState };
	});

	// The query as it stood at the last commit the path was live, with the projection it was live
	// under — what a drop compares against (see `unproject`).
	const liveQuery = React.useRef<{
		of: Projection;
		filters: FiltersOf<'products'>;
		sort: { field: string; direction: string };
	} | null>(null);

	// Take back out exactly what the path put in, and only what is still there: a pill the
	// cashier pressed inside a level is theirs and stays.
	// On a DROP (the path invalidated by someone else's change, not `root`/`backTo`/a source
	// change), only if nothing but the search moved since the path was last live: a typed search
	// spans the catalogue, and a term deleted on the server (nothing moved) still clears. A pill
	// on the source's field, a chip or Clear filters moved something else — a chip may share the
	// shortcut's condition (`categories: [3]`), or write only some of its keys, or the same ones
	// with another sort — so another actor owns the query now: the path is forgotten and the
	// query left exactly as they set it.
	const unproject = React.useCallback(
		(dropped = false) => {
			const current = projected.get();
			projected.set(null);
			// All products put nothing into the query: there is nothing to take back out.
			if (!current || current.kind === 'all') return;
			const { state: now, actions: act, resetState: baseline } = latest.current;
			const before = liveQuery.current;
			if (dropped && before?.of === current && movedBesidesSearch(now, before)) return;
			takeOutProjection(current, now, act, baseline);
		},
		[projected]
	);

	const projectEntry = React.useCallback(
		(entry: PathEntry | undefined) => {
			unproject();
			if (!entry) return;
			if (entry.term.kind === 'all') {
				// The whole catalogue: a pill on the source's own taxonomy would contradict the tile
				// the cashier just tapped, so it goes too (it is not restored — All products means
				// all). The level is live while the field stays empty; the other pills are the
				// cashier's conditions on it.
				if (field && (latest.current.state.filters[field] as number[] | undefined)?.length)
					actions.clearFilter(field);
				projected.set({ kind: 'all' });
				return;
			}
			const { term } = entry;
			if (term.kind === 'term' && field) {
				const ids = terms.idsFor(term);
				// Entering writes only `field`: every other pill stands as the cashier left it.
				actions.setFilter(field, ids as never);
				projected.set({ kind: 'taxonomy', field, ids });
				return;
			}
			const quickFilter = terms.quickFilterFor(term);
			if (!quickFilter) return;
			// The chip's exact sequence (filter-bar.tsx QuickChip), so the chip lights up too.
			actions.resetFilters();
			actions.clearSearch();
			const patch = quickFilterToQueryPatch(quickFilter);
			for (const [key, value] of Object.entries(patch.filters))
				actions.setFilter(key as keyof FiltersOf<'products'>, value as never);
			if (patch.search) actions.setSearch(patch.search);
			const sort = quickFilter.sort ?? settingsSort;
			actions.setSort(sort.field, sort.direction);
			projected.set({ kind: 'shortcut', quickFilter });
		},
		[actions, field, terms, settingsSort, unproject, projected]
	);
	// …and, for a level the path returns to, the window it had when it was covered — in the SAME
	// batch as its filter, which reset it. A level entered fresh (a new entry) keeps the base page.
	const project = React.useCallback(
		(entry: PathEntry | undefined) => {
			projectEntry(entry);
			const window = entry && windows.get(entry);
			if (window !== undefined) actions.setLimit(window);
		},
		[projectEntry, windows, actions]
	);

	// The projection belongs to the source that made it: a source change or an unmount (Browse
	// by → All products) takes it back out, or the next screen starts restricted by the last. A
	// LAYOUT effect: its cleanup runs in the commit, before paint, so the All products screen's
	// first painted frame already carries the cleared query (the products then refresh exactly as
	// they do after any pill is cleared today).
	// A PERSISTED path is not taken out on unmount: the host is swapping trees (the register's
	// layout at the phone boundary) and the next mount carries on from the same stores. Leaving
	// a source is then another mount's business: a stage for another source finds a projection
	// that is not its own and drops it (the drop effect below); All products mode releases it
	// (`useReleaseBrowsePath`).
	const persisted = persistKey !== undefined;
	React.useLayoutEffect(
		() => () => {
			if (persisted) return;
			unproject();
			setStored(NO_PATH);
		},
		[source, persisted, unproject, setStored]
	);

	// Is the deepest entry still what the query carries?
	const deepest = stored[stored.length - 1];
	let live = stored.length > 0;
	if (deepest) {
		const { term } = deepest;
		if (term.kind === 'all')
			// Live while the source's own field stays empty. A stock, Featured, Tag or Brand pill
			// pressed under All products narrows the level: it is still All products, narrowed.
			live =
				isBlankSearch(state.search) &&
				(!field || !(state.filters[field] as number[] | undefined)?.length) &&
				projection?.kind === 'all';
		else if (term.kind === 'term')
			// …and the whole chain must still stand in the source: every stored term present, each
			// still the child of the one before (a parent deleted or reparented on the server
			// leaves the child a root, or someone else's). While the source has not answered
			// (`all === undefined`), or its list is held over a pending existence read
			// (`pending`), it is unknown, not gone.
			// The filter must still be what the PATH put there (`projection`), not the term's
			// current derived set: a child added or removed under the open term changes `idsFor`
			// without the cashier touching anything — that is re-projected below, not treated as a
			// pill press. Only the source's own field is the path's: the Category pill set to
			// another value inside a Categories level leaves the level, and the drop then leaves
			// the query as the cashier set it (see `unproject`). Every other pill, and the sort,
			// is a condition on the level and moves nothing here.
			live =
				isBlankSearch(state.search) &&
				!!field &&
				projection?.kind === 'taxonomy' &&
				sameSet(state.filters[field], projection.ids) &&
				chainStands(stored, terms);
		else {
			// Once entered, a shortcut level holds while its OWN conditions do: a pill added beside
			// them narrows the level, the sort is the cashier's to change inside it (a table
			// header), and only one of the shortcut's own conditions moving (or another search)
			// is a way out. The chip's lit state is stricter — that is the chip's business.
			// The shortcut must still be the one entered: its definition edited meanwhile
			// (Customise, open beside the level) is another shortcut, and a condition the edit
			// removed must not go on filtering as if the cashier had pressed it — the level drops,
			// and the drop takes the patch that was entered back out (nothing in the query moved).
			// Its configured sort is part of the definition too (the ACTIVE sort is the cashier's and
			// is never compared).
			const quickFilter = terms.quickFilterFor(term);
			live =
				!!quickFilter &&
				projection?.kind === 'shortcut' &&
				isEqual(
					quickFilterToQueryPatch(quickFilter),
					quickFilterToQueryPatch(projection.quickFilter)
				) &&
				isEqual(quickFilter.sort, projection.quickFilter.sort) &&
				quickFilterHolds(quickFilter, state);
		}
	}
	const path = live ? stored : NO_PATH;

	// A path the query no longer carries is shown as no path in this same render (`path`), and
	// forgotten before the commit paints (a layout effect: a store is not written while
	// rendering), so a stale path is never there for `enter` to extend — no handler runs between
	// a commit and its layout effects. What it put into the query and is still there is taken back
	// out by the layout effect below, on the render that follows.
	React.useLayoutEffect(() => {
		if (stored.length > 0 && !live) setStored(NO_PATH);
	});

	// …a search typed over a term or a shortcut must span the whole catalogue (the search itself
	// stays). A projection with no path under it is a dropped path's: entering always records
	// the path in the same batch as its projection, and leaving takes the projection out itself.
	// A LAYOUT effect, as the source teardown: the search results must not paint once under the
	// old term's filter.
	// Recorded before the drop effect below reads it, and only while the path is live: the drop
	// commit's own query is what is compared, never recorded.
	React.useLayoutEffect(() => {
		if (live && projection)
			liveQuery.current = { of: projection, filters: state.filters, sort: state.sort };
	});
	React.useLayoutEffect(() => {
		if (stored.length === 0 && projection) unproject(true);
	}, [stored.length, projection, unproject]);

	// A live term level whose descendant set has changed under it (a child added, removed or
	// moved on the server) is re-projected in place: the level stays, its products follow. Keyed
	// on the set's contents, not the array identity.
	const derivedKey =
		deepest?.term.kind === 'term' ? terms.idsFor(deepest.term).join(',') : undefined;
	React.useEffect(() => {
		const current = projected.get();
		if (!live || derivedKey === undefined || !field || current?.kind !== 'taxonomy') return;
		const derived = derivedKey === '' ? [] : derivedKey.split(',').map(Number);
		if (sameSet(current.ids, derived)) return;
		projected.set({ ...current, ids: derived });
		// The level is live and keeps its result window: a result change resets it to the page
		// size, and the level's held snapshot (paged) would be replaced by the first page. The
		// committed window is read before the write and restored in the same handler, as `project`
		// does for a parent on the way back.
		const { limit } = latest.current.state;
		actions.setFilter(field, derived as never);
		if (typeof limit === 'number') actions.setLimit(limit);
	}, [live, derivedKey, field, actions, projected]);

	// BATCHING INVARIANT (`enter` and `backTo`): their writes to the query, the projection store
	// and the path store must land in the SAME render. Rendered apart, `enter`'s query moves with
	// no path stored over it, `live` reads false, and the drop above throws the tap away; `backTo`
	// commits the parent's query under the child's path for a render, so the child level reads as
	// settled over the parent's products. All three are read through `useSyncExternalStore`, so
	// they render at sync priority together whoever calls — a press, Escape, the edge swipe's
	// gesture callback, Android's back (a device event), a timer. `inOneBatch` (../one-batch)
	// still wraps the non-discrete callers: on the web it forces the render now, not a microtask
	// later.
	const enter = React.useCallback(
		(term: BrowseTerm, target?: Measurable, depth?: number) => {
			const entry: PathEntry = { kind: 'term', term, target };
			// The level this one covers keeps the window it has now (the last committed query's), for
			// the way back. A parent entered in this same batch (a deep link) is not committed yet and
			// was never paged: the base page is its window.
			const covered = stored[(depth ?? stored.length) - 1];
			const { limit } = latest.current.state;
			if (covered && typeof limit === 'number') windows.set(covered, limit);
			// One projection per tap: what the replaced entries put in comes out in `project`.
			project(entry);
			// A stale path never survives its render (above), so whatever is stored is the live
			// path, or one entered earlier in this same batch (a deep link): extend it at `depth`.
			setStored((current) => [...current.slice(0, depth ?? current.length), entry]);
		},
		[stored, windows, project, setStored]
	);
	const backTo = React.useCallback(
		(depth: number) => {
			const next = stored.slice(0, depth);
			project(next[next.length - 1]);
			setStored(next);
		},
		[stored, project, setStored]
	);
	const root = React.useCallback(() => backTo(0), [backTo]);

	return { path, enter, backTo, root };
}
