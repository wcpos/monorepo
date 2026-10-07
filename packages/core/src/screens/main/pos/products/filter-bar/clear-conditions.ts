import type { FiltersOf, QueryStateActions } from '../../../../../query';

export type TaxonomyField = 'categories' | 'tags' | 'brands';

/**
 * Clear filters, as the filter bar's Clear all and the empty state's Clear filters both mean it:
 * every pill and the search go back to the baseline. The crumb is the place, the pills are the
 * conditions, so inside a browse level the place's own field (`keep`) is written back in the
 * same batch — the level stays, its conditions go. Nothing to keep (the browse root, All
 * products mode): a plain reset.
 */
export function clearConditions(
	actions: Pick<QueryStateActions<'products'>, 'resetFilters' | 'clearSearch' | 'setFilter'>,
	filters: FiltersOf<'products'>,
	keep: TaxonomyField | null
): void {
	const kept = keep ? filters[keep] : undefined;
	actions.resetFilters();
	actions.clearSearch();
	if (keep && kept?.length) actions.setFilter(keep, kept);
}
