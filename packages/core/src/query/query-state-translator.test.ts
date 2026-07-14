import { FILTER_TRANSLATORS, translateQueryState } from './query-state-translator';

import type { CollectionKey, FiltersOf, QueryStateOf } from './query-state-types';

type ExhaustiveFilterMap = {
	[C in CollectionKey]: { [F in keyof FiltersOf<C>]-?: unknown };
};

// This assignment is intentionally part of the compile gate: adding a FiltersOf field
// without a translator entry makes this suite fail before it can run.
const exhaustiveFilterMap: ExhaustiveFilterMap = FILTER_TRANSLATORS;

describe('query-state translator', () => {
	it('has an exhaustive entry for every declared collection filter', () => {
		expect(exhaustiveFilterMap).toBe(FILTER_TRANSLATORS);
		expect(Object.keys(FILTER_TRANSLATORS.products)).toEqual([
			'categories',
			'tags',
			'brands',
			'featured',
			'on_sale',
			'stock_status',
		]);
	});

	it('documents and compiles promoted and payload-backed filter paths', () => {
		expect(FILTER_TRANSLATORS.products.categories).toMatchObject({
			storage: 'promoted',
			enginePath: 'categoryIds',
		});
		expect(FILTER_TRANSLATORS.coupons.status).toMatchObject({
			storage: 'payload',
			enginePath: 'payload.status',
		});

		const products = translateQueryState('products', {
			search: '',
			filters: { categories: [2, 7], tags: [], brands: [], featured: true },
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
				{ featured: true },
			],
		});
		expect(products).toMatchObject({ sort: [{ price: 'desc' }], limit: 25 });
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
			$and: [
				{ status: 'processing' },
				{ customer_id: 42 },
				{ meta_data: { $elemMatch: { key: '_pos_user', value: '7' } } },
				{ meta_data: { $elemMatch: { key: '_pos_store', value: '3' } } },
				{ date_created_gmt: { $gte: '2026-07-01', $lte: '2026-07-14' } },
			],
		});
		expect(translated.search).toBe('smith');
	});
});
