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
 * A quick filter is active only while the complete state it would produce after reset is present.
 */
export function isQuickFilterActive(
	quickFilter: QuickFilter,
	state: { search: string; filters: FiltersOf<'products'>; sort: QueryStateOf<'products'>['sort'] },
	resetState: { filters: FiltersOf<'products'>; sort: QueryStateOf<'products'>['sort'] }
): boolean {
	const patch = quickFilterToQueryPatch(quickFilter);
	const expectedFilters = { ...resetState.filters, ...patch.filters };
	const expectedSort = quickFilter.sort ?? resetState.sort;
	if (
		state.search !== patch.search ||
		state.sort.field !== expectedSort.field ||
		state.sort.direction !== expectedSort.direction ||
		Object.keys(state.filters).length !== Object.keys(expectedFilters).length
	) {
		return false;
	}
	return Object.keys(expectedFilters).every((field) => {
		const key = field as keyof FiltersOf<'products'>;
		const expected = expectedFilters[key];
		const actual = state.filters[key];
		if (Array.isArray(expected)) {
			return equalNumberSets(actual as number[] | undefined, expected);
		}
		if (field === 'price') {
			return (
				state.filters.price?.min === expectedFilters.price?.min &&
				state.filters.price?.max === expectedFilters.price?.max
			);
		}
		return actual === expected;
	});
}
