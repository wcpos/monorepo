import { isQuickFilterActive, quickFilterToQueryPatch } from './apply-quick-filter';

import type { QuickFilter } from './filter-bar-layout';

const filter: QuickFilter = {
	id: 'all-fields',
	type: 'quick',
	label: 'All fields',
	conditions: [
		{ field: 'categories', value: [1, 2] },
		{ field: 'tags', value: [3] },
		{ field: 'brands', value: [4] },
		{ field: 'price', value: { min: 10, max: 50 } },
		{ field: 'on_sale', value: true },
		{ field: 'featured', value: false },
		{ field: 'stock_status', value: 'onbackorder' },
		{ field: 'type', value: 'variable' },
		{ field: 'search', value: 'shirt' },
	],
};

it('converts every condition field into a products query patch', () => {
	expect(quickFilterToQueryPatch(filter)).toEqual({
		filters: {
			categories: [1, 2],
			tags: [3],
			brands: [4],
			price: { min: 10, max: 50 },
			on_sale: true,
			featured: false,
			stock_status: 'onbackorder',
			type: 'variable',
		},
		search: 'shirt',
	});
});

it('requires every field to match exactly, comparing taxonomy ids as sets', () => {
	const state = {
		search: 'shirt',
		filters: {
			categories: [2, 1],
			tags: [3],
			brands: [4],
			price: { min: 10, max: 50 },
			on_sale: true,
			featured: false,
			stock_status: 'onbackorder',
			type: 'variable',
		},
	};

	expect(isQuickFilterActive(filter, state)).toBe(true);
	expect(isQuickFilterActive(filter, { ...state, search: 'shirts' })).toBe(false);
	expect(
		isQuickFilterActive(filter, {
			...state,
			filters: { ...state.filters, categories: [1, 2, 3] },
		})
	).toBe(false);
	expect(
		isQuickFilterActive(filter, {
			...state,
			filters: { ...state.filters, price: { min: 10 } },
		})
	).toBe(false);
});

it.each(filter.conditions)('detects an active standalone $field condition', (condition) => {
	const single = { ...filter, conditions: [condition] } as QuickFilter;
	const patch = quickFilterToQueryPatch(single);
	expect(
		isQuickFilterActive(single, {
			search: patch.search,
			filters: { categories: [], tags: [], brands: [], ...patch.filters },
		})
	).toBe(true);
});
