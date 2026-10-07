import { quickFilterToQueryPatch } from '../../filter-bar/apply-quick-filter';
import { filtersAtBaseline, sameFilterValue, type TaxonomyField } from './use-browse-path';

import type { FiltersOf, QueryStateActions } from '../../../../../../query';
import type { QuickFilter } from '../../filter-bar/filter-bar-layout';

/**
 * The place a browse level's crumb stands for, as the filter bar and the empty state need it:
 * what the place itself holds in the query, so that clearing the conditions leaves it. The
 * crumb is the place, the pills are the conditions (the filters and breadcrumbs page,
 * 2026-09-17).
 */
export type LevelPlace = {
	/** The source's own field (a Categories, Tags or Brands stage); null under Shortcuts. */
	field: TaxonomyField | null;
	/** The shortcut the level is, when it is one: its own conditions are the place's. */
	quickFilter?: QuickFilter;
};

/** The query as the place alone would have it: the baseline, its field's ids, its shortcut's patch. */
function placeQuery(
	place: LevelPlace | null,
	filters: FiltersOf<'products'>,
	initialFilters: Record<string, unknown>
): { filters: Record<string, unknown>; search: string } {
	const kept: Record<string, unknown> = { ...initialFilters };
	let search = '';
	if (place?.field) kept[place.field] = filters[place.field];
	if (place?.quickFilter) {
		const patch = quickFilterToQueryPatch(place.quickFilter);
		Object.assign(kept, patch.filters);
		search = patch.search;
	}
	return { filters: kept, search };
}

/** Whether a filter key, as the query holds it, is the place's own rather than a condition. */
export function isPlaceCondition(place: LevelPlace | null, key: string, value: unknown): boolean {
	if (!place) return false;
	if (key === place.field) return true;
	if (!place.quickFilter) return false;
	const patch = quickFilterToQueryPatch(place.quickFilter).filters as Record<string, unknown>;
	return key in patch && sameFilterValue(value, patch[key]);
}

/**
 * Whether anything narrows the query beyond the place and the baseline: a condition the
 * cashier can clear. An empty level with nothing beyond its place offers no Clear filters — the
 * press would reset to the very same query — only the way back.
 */
export function conditionsBeyond(
	place: LevelPlace | null,
	state: { search: string; filters: FiltersOf<'products'> },
	initialFilters: Record<string, unknown>
): boolean {
	const own = placeQuery(place, state.filters, initialFilters);
	return (
		state.search.trim() !== own.search.trim() || !filtersAtBaseline(state.filters, own.filters)
	);
}

/**
 * Clear filters, as the filter bar's Clear all and the empty state's Clear filters both mean it:
 * every pill and the search go back to the baseline, and the place is written back in the same
 * batch — its field's ids, or its shortcut's own conditions and search — so the level stays
 * and its conditions go. No place (the browse root, All products mode): a plain reset.
 */
export function clearConditions(
	actions: Pick<
		QueryStateActions<'products'>,
		'resetFilters' | 'clearSearch' | 'setFilter' | 'setSearch'
	>,
	filters: FiltersOf<'products'>,
	place: LevelPlace | null
): void {
	const kept = place?.field ? filters[place.field] : undefined;
	actions.resetFilters();
	actions.clearSearch();
	if (place?.field && kept?.length) actions.setFilter(place.field, kept as never);
	if (place?.quickFilter) {
		const patch = quickFilterToQueryPatch(place.quickFilter);
		for (const [key, value] of Object.entries(patch.filters))
			actions.setFilter(key as keyof FiltersOf<'products'>, value as never);
		if (patch.search) actions.setSearch(patch.search);
	}
}
