import {
	captureQuickFilter,
	isQuickFilterActive,
	quickFilterToQueryPatch,
} from './apply-quick-filter';

import type { QuickFilter } from './filter-bar-layout';

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));

const resetState = {
	filters: { categories: [], tags: [], brands: [], status: 'publish' as const },
	sort: { field: 'name' as const, direction: 'asc' as const },
};

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
		sort: { field: 'name' as const, direction: 'asc' as const },
		filters: {
			...resetState.filters,
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

	expect(isQuickFilterActive(filter, state, resetState)).toBe(true);
	expect(isQuickFilterActive(filter, { ...state, search: 'shirts' }, resetState)).toBe(false);
	expect(
		isQuickFilterActive(
			filter,
			{
				...state,
				filters: { ...state.filters, categories: [1, 2, 3] },
			},
			resetState
		)
	).toBe(false);
	expect(
		isQuickFilterActive(
			filter,
			{
				...state,
				filters: { ...state.filters, price: { min: 10 } },
			},
			resetState
		)
	).toBe(false);
});

it.each(filter.conditions)('detects an active standalone $field condition', (condition) => {
	const single = { ...filter, conditions: [condition] } as QuickFilter;
	const patch = quickFilterToQueryPatch(single);
	expect(
		isQuickFilterActive(
			single,
			{
				search: patch.search,
				sort: { field: 'name', direction: 'asc' },
				filters: { ...resetState.filters, ...patch.filters },
			},
			resetState
		)
	).toBe(true);
});

it('rejects extra filters and the wrong effective default sort', () => {
	const onSale = { ...filter, conditions: [{ field: 'on_sale', value: true }] } as QuickFilter;
	const matching = {
		search: '',
		filters: { ...resetState.filters, on_sale: true },
		sort: resetState.sort,
	};

	expect(isQuickFilterActive(onSale, matching, resetState)).toBe(true);
	expect(
		isQuickFilterActive(
			onSale,
			{ ...matching, filters: { ...matching.filters, featured: true } },
			resetState
		)
	).toBe(false);
	expect(
		isQuickFilterActive(
			onSale,
			{ ...matching, sort: { field: 'sku', direction: 'asc' } },
			resetState
		)
	).toBe(false);
});

it('is active only while its sort is applied, so a sort-only button can be pressed on', () => {
	const sortOnly: QuickFilter = {
		id: 'cheapest',
		type: 'quick',
		label: 'Cheapest first',
		conditions: [],
		sort: { field: 'sortable_price', direction: 'asc' },
	};
	const baseline = { search: '', filters: resetState.filters };

	expect(
		isQuickFilterActive(
			sortOnly,
			{ ...baseline, sort: { field: 'name', direction: 'asc' } },
			resetState
		)
	).toBe(false);
	expect(
		isQuickFilterActive(
			sortOnly,
			{
				...baseline,
				sort: { field: 'sortable_price', direction: 'desc' },
			},
			resetState
		)
	).toBe(false);
	expect(
		isQuickFilterActive(
			sortOnly,
			{
				...baseline,
				sort: { field: 'sortable_price', direction: 'asc' },
			},
			resetState
		)
	).toBe(true);
});

const baseline = { ...resetState.filters, stock_status: 'instock' as const };
it('captures only set conditions outside the POS baseline, trimming search and finite price bounds', () => {
	expect(
		captureQuickFilter(
			{
				search: ' mug ',
				sort: resetState.sort,
				filters: {
					...baseline,
					categories: [1],
					tags: [2],
					brands: [3],
					on_sale: true,
					featured: true,
					stock_status: 'outofstock',
					type: 'simple',
					price: { min: Infinity, max: 20 },
				},
			},
			baseline,
			resetState.sort
		)
	).toEqual({
		conditions: [
			{ field: 'categories', value: [1] },
			{ field: 'tags', value: [2] },
			{ field: 'brands', value: [3] },
			{ field: 'price', value: { max: 20 } },
			{ field: 'on_sale', value: true },
			{ field: 'featured', value: true },
			{ field: 'stock_status', value: 'outofstock' },
			{ field: 'type', value: 'simple' },
			{ field: 'search', value: 'mug' },
		],
	});
});
it('omits baseline, empty groups, false booleans and nonfinite price bounds', () => {
	expect(
		captureQuickFilter(
			{
				search: ' ',
				sort: resetState.sort,
				filters: {
					...baseline,
					on_sale: false,
					featured: false,
					price: { min: NaN, max: Infinity },
				},
			},
			baseline,
			resetState.sort
		)
	).toEqual({ conditions: [] });
});
it.each([
	{ field: 'name', direction: 'desc' },
	{ field: 'sortable_price', direction: 'asc' },
] as const)('captures a differing sort %j', (sort) => {
	expect(
		captureQuickFilter({ search: '', filters: baseline, sort }, baseline, resetState.sort)
	).toEqual({ conditions: [], sort });
});
it.each([
	{ ...baseline, categories: [1, 2], on_sale: true },
	{ ...baseline, tags: [3], brands: [4], price: { min: 0, max: 20 }, type: 'variable' as const },
])('round trips captured filters over their baseline %#', (filters) => {
	const captured = captureQuickFilter(
		{ search: '', sort: resetState.sort, filters },
		baseline,
		resetState.sort
	);
	expect({ ...baseline, ...quickFilterToQueryPatch({ ...filter, ...captured }).filters }).toEqual(
		filters
	);
});
