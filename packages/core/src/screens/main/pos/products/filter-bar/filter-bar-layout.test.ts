import {
	BUILT_IN_PILL_IDS,
	DEFAULT_FILTER_BAR,
	describeQuickFilter,
	getQuickFilterSortLabel,
	isQuickFilterValid,
	migrateLegacyQuickFilters,
	normalizeFilterBar,
	quickFilterSortSchema,
} from './filter-bar-layout';

import type { QuickFilter } from './filter-bar-layout';

jest.mock('uuid', () => ({ v4: () => 'quick-filter-id' }));

const t = (key: string, values?: Record<string, string | number>) => {
	const messages: Record<string, string> = {
		'common.category': 'Category',
		'common.on_sale': 'On sale',
		'common.price': 'Price',
		'common.type': 'Type',
		'pos_products.quick_filter_selected': '{label}: {count} selected',
		'pos_products.quick_filter_price_range': 'Price {min}–{max}',
		'pos_products.quick_filter_sort': 'Sort: {field} {direction}',
	};
	return Object.entries(values ?? {}).reduce(
		(message, [name, value]) => message.replace(`{${name}}`, String(value)),
		messages[key] ?? key
	);
};

const quick = (over: Partial<QuickFilter> = {}): QuickFilter => ({
	id: 'quick-1',
	type: 'quick',
	label: 'My filter',
	conditions: [{ field: 'featured', value: true }],
	...over,
});

describe('normalizeFilterBar', () => {
	it('drops malformed entries, keeps the first id, and appends missing built-in pills', () => {
		const result = normalizeFilterBar([
			quick(),
			quick({ label: 'Duplicate' }),
			{ id: 'featured', type: 'pill', show: false },
			{ id: 'not-a-pill', type: 'pill', show: true },
		]);

		expect(result[0]).toEqual(quick());
		expect(result[1]).toEqual({ id: 'featured', type: 'pill', show: false });
		expect(result.filter((item) => item.id === 'quick-1')).toHaveLength(1);
		expect(result.filter((item) => item.type === 'pill').map((item) => item.id)).toEqual([
			'featured',
			'stock_status',
			'on_sale',
			'categories',
			'tags',
			'brands',
		]);
	});

	it('uses the authored defaults for non-array input', () => {
		expect(normalizeFilterBar(null)).toEqual(DEFAULT_FILTER_BAR);
		expect(DEFAULT_FILTER_BAR.map((item) => item.id)).toEqual(BUILT_IN_PILL_IDS);
	});

	it('drops a persisted quick filter with an empty price range', () => {
		const result = normalizeFilterBar([quick({ conditions: [{ field: 'price', value: {} }] })]);

		expect(result.some((item) => item.type === 'quick')).toBe(false);
	});

	it('retains a persisted sort-only product type filter', () => {
		const filter = quick({ conditions: [], sort: { field: 'type', direction: 'asc' } });

		expect(normalizeFilterBar([filter])[0]).toEqual(filter);
	});
});

describe('migrateLegacyQuickFilters', () => {
	it.each([
		['category', '12', { field: 'categories', value: [12] }],
		['tag', '13', { field: 'tags', value: [13] }],
		['brand', '14', { field: 'brands', value: [14] }],
		['featured', '', { field: 'featured', value: true }],
		['on_sale', '', { field: 'on_sale', value: true }],
		['stock_status', 'outofstock', { field: 'stock_status', value: 'outofstock' }],
		['search', ' gift ', { field: 'search', value: 'gift' }],
	] as const)('migrates %s', (kind, value, condition) => {
		expect(migrateLegacyQuickFilters([{ id: kind, label: ' Legacy ', kind, value }])).toEqual([
			{ id: kind, type: 'quick', label: 'Legacy', conditions: [condition] },
		]);
	});

	it('drops malformed and empty valued legacy entries', () => {
		expect(
			migrateLegacyQuickFilters([
				{ id: 'bad-term', label: 'Bad', kind: 'category', value: 'nope' },
				{ id: 'empty-search', label: 'Empty', kind: 'search', value: ' ' },
				{ id: 'empty-label', label: ' ', kind: 'featured', value: '' },
			])
		).toEqual([]);
	});
});

describe('isQuickFilterValid', () => {
	it.each([
		[quick(), true],
		[quick({ label: ' ' }), false],
		[quick({ conditions: [] }), false],
		[quick({ conditions: [], sort: { field: 'name', direction: 'asc' } }), true],
		[quick({ conditions: [{ field: 'categories', value: [] }] }), false],
		[quick({ conditions: [{ field: 'search', value: ' ' }] }), false],
		[quick({ conditions: [{ field: 'price', value: {} }] }), false],
		[quick({ conditions: [{ field: 'price', value: { min: 20, max: 10 } }] }), false],
		[quick({ conditions: [{ field: 'price', value: { min: 10, max: 20 } }] }), true],
	] as const)('validates semantic case %#', (value, expected) => {
		expect(isQuickFilterValid(value)).toBe(expected);
	});
});

it('describes conditions and sort in one muted summary', () => {
	expect(
		describeQuickFilter(
			quick({
				conditions: [
					{ field: 'categories', value: [2, 5] },
					{ field: 'on_sale', value: true },
					{ field: 'price', value: { min: 10, max: 50 } },
				],
				sort: { field: 'sortable_price', direction: 'asc' },
			}),
			t,
			(value) => `€${value.toFixed(2)}`
		)
	).toBe('Category: 2 selected · On sale · Price €10.00–€50.00 · Sort: Price ↑');
});

it('supports product type as a saved sort field', () => {
	expect(quickFilterSortSchema.safeParse({ field: 'type', direction: 'asc' }).success).toBe(true);
	expect(getQuickFilterSortLabel('type', t)).toBe('Type');
});
