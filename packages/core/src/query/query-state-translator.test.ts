import { requirementsForQuery } from '@wcpos/query';

import {
	FILTER_TRANSLATORS,
	normalizeQuerySortField,
	translateQueryState,
} from './query-state-translator';

import type { CollectionKey, FiltersOf, QueryStateOf } from './query-state-types';

type ExhaustiveFilterMap = {
	[C in CollectionKey]: { [F in keyof FiltersOf<C>]-?: unknown };
};

// This assignment is intentionally part of the compile gate: adding a FiltersOf field
// without a translator entry makes this suite fail before it can run.
const exhaustiveFilterMap: ExhaustiveFilterMap = FILTER_TRANSLATORS;

describe('query-state translator', () => {
	it.each([
		['price', 'sortable_price'],
		['regular_price', 'regular_price'],
		['sale_price', 'sale_price'],
		['stock_quantity', 'stock_quantity'],
		['stock_status', 'stock_status'],
	] as const)('normalizes the products UI sort key %s to %s', (uiField, queryField) => {
		expect(normalizeQuerySortField('products', uiField)).toBe(queryField);
	});

	it('keeps the POS runtime product sort surface mapped to engine paths', () => {
		const state = {
			search: '',
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'total_sales', direction: 'desc' },
			limit: 10,
		} as unknown as QueryStateOf<'products'>;

		expect(translateQueryState('products', state)).toMatchObject({
			sort: [{ total_sales: 'desc' }],
			sortEnginePath: 'payload.total_sales',
		});
	});
	it('has an exhaustive entry for every declared collection filter', () => {
		expect(exhaustiveFilterMap).toBe(FILTER_TRANSLATORS);
		expect(Object.keys(FILTER_TRANSLATORS.products)).toEqual([
			'categories',
			'tags',
			'brands',
			'featured',
			'on_sale',
			'stock_status',
			'status',
		]);
	});

	it('preserves every legacy products filter selector shape', () => {
		expect(FILTER_TRANSLATORS.products.categories).toMatchObject({
			storage: 'promoted',
			enginePath: 'categoryIds',
		});
		expect(FILTER_TRANSLATORS.products.tags).toMatchObject({
			storage: 'payload',
			enginePath: 'payload.tags',
		});
		expect(FILTER_TRANSLATORS.products.brands).toMatchObject({
			storage: 'promoted',
			enginePath: 'brandIds',
		});

		const products = translateQueryState('products', {
			search: '',
			filters: {
				categories: [2, 7],
				tags: [5],
				brands: [9],
				featured: true,
				on_sale: false,
				stock_status: 'outofstock',
				status: 'publish',
			},
			sort: { field: 'price', direction: 'desc' },
			limit: 25,
		} satisfies QueryStateOf<'products'>);
		expect(products.selector).toEqual({
			$and: [
				{
					$or: [
						{ categories: { $elemMatch: { id: 2 } } },
						{ categories: { $elemMatch: { id: 7 } } },
					],
				},
				{ $or: [{ tags: { $elemMatch: { id: 5 } } }] },
				{ $or: [{ brands: { $elemMatch: { id: 9 } } }] },
				{ featured: true },
				{ on_sale: false },
				{ stock_status: 'outofstock' },
				{ status: 'publish' },
			],
		});
		expect(products).toMatchObject({ sort: [{ sortable_price: 'desc' }], limit: 25 });
	});

	it('composes order payload metadata with promoted filters and dates', () => {
		const translated = translateQueryState('orders', {
			search: 'smith',
			filters: {
				status: 'processing',
				customer_id: 42,
				cashier: 7,
				store: 3,
				dateRange: { from: '2026-07-01', to: '2026-07-14' },
			},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 50,
		} satisfies QueryStateOf<'orders'>);

		expect(translated.selector).toEqual({
			status: 'processing',
			$and: [
				{ customer_id: 42 },
				{ meta_data: { $elemMatch: { key: '_pos_user', value: '7' } } },
				{ meta_data: { $elemMatch: { key: '_pos_store', value: '3' } } },
				{ date_created_gmt: { $gte: '2026-07-01', $lte: '2026-07-14' } },
			],
		});
		expect(translated.search).toBe('smith');
	});

	it('normalizes cashier ids before matching order metadata', () => {
		const translated = translateQueryState('orders', {
			search: '',
			filters: { cashier: ' 0007 ' },
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 50,
		} satisfies QueryStateOf<'orders'>);

		expect(translated.selector).toEqual({
			$and: [{ meta_data: { $elemMatch: { key: '_pos_user', value: '7' } } }],
		});
	});

	it('sorts order totals through the numeric adapter field', () => {
		const translated = translateQueryState('orders', {
			search: '',
			filters: {},
			sort: { field: 'total', direction: 'asc' },
			limit: 50,
		} satisfies QueryStateOf<'orders'>);

		expect(translated.sort).toEqual([{ sortable_total: 'asc' }]);
	});

	it('preserves the legacy mutually-exclusive created_via and _pos_store selector branches', () => {
		const base = {
			search: '',
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 10,
		} as const;

		expect(translateQueryState('orders', { ...base, filters: { store: '12' } }).selector).toEqual({
			$and: [{ meta_data: { $elemMatch: { key: '_pos_store', value: '12' } } }],
		});
		expect(
			translateQueryState('orders', { ...base, filters: { store: 'checkout' } }).selector
		).toEqual({
			$and: [{ created_via: 'checkout' }],
		});
	});

	it('keeps order demand fields visible to the requirement bridge', () => {
		const translated = translateQueryState('orders', {
			search: '',
			filters: {
				status: 'processing',
				customer_id: 42,
				dateRange: { from: '2026-07-01', to: '2026-07-14' },
			},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 50,
		} satisfies QueryStateOf<'orders'>);
		const requirementInput = {
			id: 'orders-binding',
			collectionName: translated.collectionName,
			limit: translated.limit,
		};

		expect(requirementsForQuery({ ...requirementInput, selector: translated.selector })).toEqual(
			requirementsForQuery({ ...requirementInput, selector: { status: 'processing' } })
		);
	});

	it('keeps the completed reports date window representable as orders demand', () => {
		const translated = translateQueryState('orders', {
			search: '',
			filters: {
				status: 'completed',
				cashier: '7',
				store: '12',
				dateRange: { from: '2026-07-15T00:00:00.000Z', to: '2026-07-15T23:59:59.999Z' },
			},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: Number.MAX_SAFE_INTEGER,
		} satisfies QueryStateOf<'orders'>);

		expect(
			requirementsForQuery({
				id: 'reports-orders-binding',
				collectionName: translated.collectionName,
				selector: translated.selector,
				limit: translated.limit,
			})
		).toEqual([
			{
				id: 'reports-orders-binding:orders-query',
				collection: 'orders',
				kind: 'query',
				queryKey: 'orders:browser:status=completed:search=:limit=200',
			},
		]);
	});
});
