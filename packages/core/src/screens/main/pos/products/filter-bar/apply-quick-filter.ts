import type { FiltersOf, QueryStateOf } from '../../../../../query/query-state-types';
import type { QuickFilter } from './filter-bar-layout';

export function quickFilterToQueryPatch(quickFilter: QuickFilter): {
	filters: Partial<FiltersOf<'products'>>;
	search: string;
} {
	const filters: Partial<FiltersOf<'products'>> = {};
	let search = '';
	for (const condition of quickFilter.conditions) {
		if (condition.field === 'search') search = condition.value;
		else Object.assign(filters, { [condition.field]: condition.value });
	}
	return { filters, search };
}

function equalNumberSets(left: number[] | undefined, right: number[]): boolean {
	return !!left && left.length === right.length && right.every((value) => left.includes(value));
}

/**
 * A quick filter is active while everything it would apply is reflected in the query state:
 * every condition exactly, and — when it carries one — its sort. A sort-only button has no
 * conditions, so without the sort check `every` would be vacuously true and the button could
 * never be pressed ON.
 */
export function isQuickFilterActive(
	quickFilter: QuickFilter,
	state: { search: string; filters: FiltersOf<'products'>; sort: QueryStateOf<'products'>['sort'] }
): boolean {
	if (
		quickFilter.sort &&
		(state.sort.field !== quickFilter.sort.field ||
			state.sort.direction !== quickFilter.sort.direction)
	) {
		return false;
	}
	return quickFilter.conditions.every((condition) => {
		if (condition.field === 'search') return state.search === condition.value;
		if (
			condition.field === 'categories' ||
			condition.field === 'tags' ||
			condition.field === 'brands'
		) {
			return equalNumberSets(state.filters[condition.field], condition.value);
		}
		if (condition.field === 'price') {
			return (
				state.filters.price?.min === condition.value.min &&
				state.filters.price?.max === condition.value.max
			);
		}
		return state.filters[condition.field] === condition.value;
	});
}
