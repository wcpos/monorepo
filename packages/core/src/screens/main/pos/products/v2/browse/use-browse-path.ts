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
/** What the path put into the query, so that exactly that can be taken back out. */
type Projection =
	| { kind: 'taxonomy'; field: TaxonomyField; ids: number[] }
	| { kind: 'shortcut'; quickFilter: QuickFilter };

/**
 * No search, as the query compiler reads it: it trims the term, so a whitespace-only search
 * searches for nothing and must not displace the term set or drop the path.
 */
export function isBlankSearch(search: string): boolean {
	return search.trim() === '';
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
 * Whether the query moved anywhere but where the projection writes (and the search) since the
 * path was last live: a taxonomy projection owns its field; a shortcut owns its patch's keys and
 * the sort (its chip sets one either way).
 */
function movedElsewhere(
	projection: Projection,
	now: { filters: FiltersOf<'products'>; sort: { field: string; direction: string } },
	before: { filters: FiltersOf<'products'>; sort: { field: string; direction: string } }
): boolean {
	const owned = new Set<string>(
		projection.kind === 'taxonomy'
			? [projection.field]
			: Object.keys(quickFilterToQueryPatch(projection.quickFilter).filters)
	);
	const keys = new Set([...Object.keys(now.filters), ...Object.keys(before.filters)]);
	for (const key of keys) {
		if (owned.has(key)) continue;
		const field = key as keyof FiltersOf<'products'>;
		if (!isEqual(now.filters[field], before.filters[field])) return true;
	}
	return projection.kind === 'taxonomy' && !sameSort(now.sort, before.sort);
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
	// path precisely when its chip lights.
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
	// change), only if nothing but the projected keys and the search moved since the path was
	// last live: a quick-filter chip pressed inside a shortcut level that shares the shortcut's
	// condition (`categories: [3]`) must keep it — another actor owns the query now, so the path
	// is forgotten and the query left exactly as they set it.
	const unproject = React.useCallback(
		(dropped = false) => {
			const current = projected.get();
			projected.set(null);
			if (!current) return;
			const { state: now, actions: act, resetState: baseline } = latest.current;
			const before = liveQuery.current;
			if (dropped && before?.of === current && movedElsewhere(current, now, before)) return;
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
				// all). Nothing is recorded: the level is live while the field stays empty.
				if (field && (latest.current.state.filters[field] as number[] | undefined)?.length)
					actions.clearFilter(field);
				return;
			}
			const { term } = entry;
			if (term.kind === 'term' && field) {
				const ids = terms.idsFor(term);
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
			live =
				isBlankSearch(state.search) &&
				(!field || !(state.filters[field] as number[] | undefined)?.length);
		else if (term.kind === 'term')
			// …and the whole chain must still stand in the source: every stored term present, each
			// still the child of the one before (a parent deleted or reparented on the server
			// leaves the child a root, or someone else's). While the source has not answered
			// (`all === undefined`) it is unknown, not gone.
			// The filter must still be what the PATH put there (`projection`), not the term's
			// current derived set: a child added or removed under the open term changes `idsFor`
			// without the cashier touching anything — that is re-projected below, not treated as a
			// pill press.
			live =
				isBlankSearch(state.search) &&
				!!field &&
				projection?.kind === 'taxonomy' &&
				sameSet(state.filters[field], projection.ids) &&
				chainStands(stored, terms.all);
		else {
			const quickFilter = terms.quickFilterFor(term);
			live = !!quickFilter && isQuickFilterActive(quickFilter, state, resetState);
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
		projected.set({ kind: 'taxonomy', field, ids: derived });
		actions.setFilter(field, derived as never);
	}, [live, derivedKey, field, actions, projected]);

	// BATCHING INVARIANT: `enter` must run from a discrete event handler (every caller is a
	// `Pressable` press today). Its writes to the query and the projection store (both read
	// through `useSyncExternalStore`, so they render at sync priority) and `setStored` have to
	// land in the SAME render — which only a discrete event gives `setStored`. Rendered apart, the
	// query moves with no path stored over it (or the path is stored over a query that does not
	// carry it yet), `live` reads false, and the drop above throws the tap away. Never call it
	// from a gesture-handler or animation callback, a timer or a promise, or inside
	// `startTransition`, without forcing one sync batch around it (`flushSync`).
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
