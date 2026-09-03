import type { FiltersOf } from '../../../../../query/query-state-types';
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

export function isQuickFilterActive(
	quickFilter: QuickFilter,
	state: { search: string; filters: FiltersOf<'products'> }
): boolean {
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
