import * as React from 'react';

import isEqual from 'lodash/isEqual';

import { useDocField } from '@wcpos/query';

import { useQueryState, useQueryStateActions } from '../../../../../../query';
import { useUISettings } from '../../../../contexts/ui-settings';
import { isQuickFilterActive, quickFilterToQueryPatch } from '../../filter-bar/apply-quick-filter';
import { getPOSProductSort } from '../../pos-product-sort';
import { type BrowseBy, type BrowseTerm, termKey } from './browse-source';

import type { Measurable } from '../deal-stack';
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

type TaxonomyField = 'categories' | 'tags' | 'brands';
/**
 * What the path put into the query, so that exactly that can be taken back out. A taxonomy
 * projection also records every OTHER filter as it stood when it was made (`rest`): the level
 * is live only while they still stand. All products puts nothing in (it only clears the
 * source's own field), but it records `rest` the same way, for the same liveness.
 */
type Projection =
	| { kind: 'taxonomy'; field: TaxonomyField; ids: number[]; rest: Partial<FiltersOf<'products'>> }
	| { kind: 'all'; rest?: Partial<FiltersOf<'products'>> }
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
		return key in initialFilters && JSON.stringify(value) === JSON.stringify(initial);
	});
}

export function taxonomyField(source: BrowseBy): 'categories' | 'tags' | 'brands' | null {
	return source === 'categories' || source === 'tags' || source === 'brands' ? source : null;
}

const NO_PATH: PathEntry[] = [];

const sameSet = (left: unknown, right: number[]) =>
	Array.isArray(left) && left.length === right.length && right.every((id) => left.includes(id));
const sameSort = (
	left: { field: string; direction: string },
	right: { field: string; direction: string }
) => left.field === right.field && left.direction === right.direction;

/**
 * The filters other than `field`: what a taxonomy level (or All products) must find unchanged
 * to stay live. No field (All products under Shortcuts): every filter.
 */
function filtersBesides(
	filters: FiltersOf<'products'>,
	field: TaxonomyField | null
): Partial<FiltersOf<'products'>> {
	if (!field) return filters;
	const { [field]: _projected, ...rest } = filters;
	return rest;
}

/**
 * Whether anything but the search moved since the path was last live — any filter, the
 * projected ones included, or the sort. A typed search moves only the search; a pill, a chip or
 * Clear filters moves something else, and the query is then theirs.
 */
function movedBesidesSearch(
	now: { filters: FiltersOf<'products'>; sort: { field: string; direction: string } },
	before: { filters: FiltersOf<'products'>; sort: { field: string; direction: string } }
): boolean {
	return !isEqual(now.filters, before.filters) || !sameSort(now.sort, before.sort);
}

/**
 * Every stored term is still in the source, the first is still a root (its parent absent or
 * not in the source), and each later one is still the child of the one before.
 */
function chainStands(stored: PathEntry[], all: BrowseTerm[] | undefined): boolean {
	if (all === undefined) return true;
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
 * What the stored path has put into the query. Written by handlers, effects and cleanups (which
 * run after the render that moved the source or unmounted the stage), and read by the render
 * through `useSyncExternalStore` — a ref's value may not be read while rendering.
 */
function createProjectionStore() {
	let value: Projection | null = null;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (next: Projection | null) => {
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
 * a pill press, Clear filters, or a quick-filter chip all move the query, and the path falls
 * away on the same render — the guard the variations drill-in already applies to search.
 */
export function useBrowsePath(source: Exclude<BrowseBy, 'all'>, terms: BrowseTerms): BrowsePath {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const { uiSettings } = useUISettings('pos-products');
	// Exactly what the chip reads (filter-bar.tsx QuickChip), so a shortcut is active for the
	// path when its chip's filters and search hold (its sort aside, once entered — see below).
	const settingsSort = useDocField(uiSettings, (value) =>
		getPOSProductSort(value.sortBy, value.sortDirection)
	);
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	const field = taxonomyField(source);
	// The path is the SOURCE's: a path stored under Categories is nothing under Tags from the very
	// render the source changes (the cleanup below then takes its projection out).
	const [storedFor, setStoredFor] = React.useState<{ source: BrowseBy; entries: PathEntry[] }>({
		source,
		entries: NO_PATH,
	});
	const stored = storedFor.source === source ? storedFor.entries : NO_PATH;
	const setStored = React.useCallback(
		(update: PathEntry[] | ((current: PathEntry[]) => PathEntry[])) =>
			setStoredFor((current) => ({
				source,
				entries:
					typeof update === 'function'
						? update(current.source === source ? current.entries : NO_PATH)
						: update,
			})),
		[source]
	);
	const resetState = React.useMemo(
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

	const [projected] = React.useState(createProjectionStore);
	const projection = React.useSyncExternalStore(projected.subscribe, projected.get, projected.get);
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
	// spans the catalogue, and a term deleted on the server (nothing moved) still clears. A pill,
	// a chip or Clear filters moved something else — a chip may share the shortcut's condition
	// (`categories: [3]`), or write only some of its keys, or the same ones with another sort —
	// so another actor owns the query now: the path is forgotten and the query left exactly as
	// they set it.
	const unproject = React.useCallback(
		(dropped = false) => {
			const current = projected.get();
			projected.set(null);
			// All products put nothing into the query: there is nothing to take back out.
			if (!current || current.kind === 'all') return;
			const { state: now, actions: act, resetState: baseline } = latest.current;
			const before = liveQuery.current;
			if (dropped && before?.of === current && movedBesidesSearch(now, before)) return;
			if (current.kind === 'taxonomy') {
				if (sameSet(now.filters[current.field], current.ids)) act.clearFilter(current.field);
				return;
			}
			const patch = quickFilterToQueryPatch(current.quickFilter);
			for (const [key, value] of Object.entries(patch.filters)) {
				const field = key as keyof FiltersOf<'products'>;
				if (!isEqual(now.filters[field], value)) continue;
				// A key the baseline owns (status, stock_status under the device setting) goes back to
				// its baseline value, not away: a shortcut on in-stock must not leave out-of-stock on.
				const base = baseline.filters[field as keyof typeof baseline.filters];
				if (base !== undefined && !(Array.isArray(base) && base.length === 0))
					act.setFilter(field, base as never);
				else act.clearFilter(field);
			}
			if (patch.search && now.search === patch.search) act.clearSearch();
			if (current.quickFilter.sort && sameSort(now.sort, current.quickFilter.sort))
				act.setSort(baseline.sort.field, baseline.sort.direction);
		},
		[projected]
	);

	const project = React.useCallback(
		(entry: PathEntry | undefined) => {
			unproject();
			if (!entry) return;
			if (entry.term.kind === 'all') {
				// The whole catalogue: a pill on the source's own taxonomy would contradict the tile
				// the cashier just tapped, so it goes too (it is not restored — All products means
				// all). The level is live while the field stays empty and the other filters stand
				// as they did on entry (`rest`, as a term level records it). `rest` is taken from
				// the commit the entry lands in (below), not from here: what `unproject` just took
				// out of the last commit's query (a shortcut's patch) is not in it.
				if (field && (latest.current.state.filters[field] as number[] | undefined)?.length)
					actions.clearFilter(field);
				projected.set({ kind: 'all' });
				return;
			}
			const { term } = entry;
			if (term.kind === 'term' && field) {
				const ids = terms.idsFor(term);
				actions.setFilter(field, ids as never);
				// Entering writes only `field`, so the rest stands as it was committed.
				const rest = filtersBesides(latest.current.state.filters, field);
				projected.set({ kind: 'taxonomy', field, ids, rest });
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

	// The projection belongs to the source that made it: a source change or an unmount (Browse
	// by → All products) takes it back out, or the next screen starts restricted by the last. A
	// LAYOUT effect: its cleanup runs in the commit, before paint, so the All products screen's
	// first painted frame already carries the cleared query (the products then refresh exactly as
	// they do after any pill is cleared today).
	React.useLayoutEffect(
		() => () => {
			unproject();
			setStored(NO_PATH);
		},
		[source, unproject, setStored]
	);

	// Is the deepest entry still what the query carries?
	const deepest = stored[stored.length - 1];
	let live = stored.length > 0;
	if (deepest) {
		const { term } = deepest;
		if (term.kind === 'all')
			// As a term level: a Brand, Tag or stock pill pressed under All products asks for the
			// catalogue narrowed by it, which is not All products any more.
			live =
				isBlankSearch(state.search) &&
				(!field || !(state.filters[field] as number[] | undefined)?.length) &&
				projection?.kind === 'all' &&
				(!projection.rest || isEqual(filtersBesides(state.filters, field), projection.rest));
		else if (term.kind === 'term')
			// …and the whole chain must still stand in the source: every stored term present, each
			// still the child of the one before (a parent deleted or reparented on the server
			// leaves the child a root, or someone else's). While the source has not answered
			// (`all === undefined`) it is unknown, not gone.
			// The filter must still be what the PATH put there (`projection`), not the term's
			// current derived set: a child added or removed under the open term changes `idsFor`
			// without the cashier touching anything — that is re-projected below, not treated as a
			// pill press.
			// No OTHER filter may have moved either (a sort may: the cashier sorts inside a level):
			// a Brand pill pressed in a Categories level asks for the catalogue-wide Brand results,
			// not Brand within the term. The drop then leaves the query as the cashier set it — the
			// term's ids are NOT taken out (see `unproject`): their pill now owns the query, and the
			// Category pill shows the term's ids for them to clear.
			live =
				isBlankSearch(state.search) &&
				!!field &&
				projection?.kind === 'taxonomy' &&
				sameSet(state.filters[field], projection.ids) &&
				isEqual(filtersBesides(state.filters, field), projection.rest) &&
				chainStands(stored, terms.all);
		else {
			// Once entered, a shortcut level holds while its filters and search do: the sort is the
			// cashier's to change inside the level (a table header), never a way out of it. The
			// chip's own lit state still compares the sort — that is the chip's business.
			const quickFilter = terms.quickFilterFor(term);
			live =
				!!quickFilter &&
				isQuickFilterActive(
					quickFilter,
					{ ...state, sort: quickFilter.sort ?? resetState.sort },
					resetState
				);
		}
	}
	const path = live ? stored : NO_PATH;

	// A path the query no longer carries is forgotten in this same render (React's "previous
	// render" pattern: the render is redone before it commits), so a stale path is never there
	// for `enter` to extend. What it put into the query and is still there is taken back out
	// by the layout effect below.
	if (stored.length > 0 && !live) setStoredFor({ source, entries: NO_PATH });

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
	// All products' `rest`: the other filters as the entry's own commit has them, recorded before
	// paint (the store re-renders this at once, still live).
	React.useLayoutEffect(() => {
		if (live && projection?.kind === 'all' && !projection.rest)
			projected.set({ kind: 'all', rest: filtersBesides(state.filters, field) });
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
		actions.setFilter(field, derived as never);
	}, [live, derivedKey, field, actions, projected]);

	// BATCHING INVARIANT (`enter` and `backTo`): both must run from a discrete event handler
	// (a `Pressable` press, Escape) or inside `inOneBatch` (../one-batch: the edge swipe). Their
	// writes to the query and the projection store (both read through `useSyncExternalStore`, so
	// they render at sync priority) and `setStored` have to land in the SAME render — which only
	// a discrete event, or `flushSync`, gives `setStored`. Rendered apart, `enter`'s query moves
	// with no path stored over it, `live` reads false, and the drop above throws the tap away;
	// `backTo` commits the parent's query under the child's path for a render, so the child
	// level reads as settled over the parent's products. Never call either from a gesture-handler
	// or animation callback, a timer or a promise, or inside `startTransition`, without it.
	const enter = React.useCallback(
		(term: BrowseTerm, target?: Measurable, depth?: number) => {
			const entry: PathEntry = { kind: 'term', term, target };
			// One projection per tap: what the replaced entries put in comes out in `project`.
			project(entry);
			// A stale path never survives its render (above), so whatever is stored is the live
			// path, or one entered earlier in this same batch (a deep link): extend it at `depth`.
			setStored((current) => [...current.slice(0, depth ?? current.length), entry]);
		},
		[project, setStored]
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
