import { orderBrowserQueryKey } from '@wcpos/query/testing';

import {
	compileQuery,
	FILTER_TRANSLATORS,
	normalizeQuerySortField,
	requirementsForCompiledQuery,
	translateLogsQueryState,
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

		const compiled = compileQuery('products', state, { id: 'products' });
		expect(compiled.demand[0]).toMatchObject({
			orderby: 'popularity',
			order: 'desc',
		});
		expect(compiled.read.sort).toHaveLength(1);
	});

	it.each(['asc', 'desc'] as const)(
		'adds the Woo id tiebreak to the products menu_order catalog sort (%s, #810)',
		(direction) => {
			const state = {
				search: '',
				filters: { categories: [], tags: [], brands: [] },
				sort: { field: 'menu_order', direction },
				limit: 10,
			} as unknown as QueryStateOf<'products'>;

			const compiled = compileQuery('products', state, { id: 'products' });
			expect(compiled.demand[0]).toMatchObject({
				orderby: 'menu_order',
				order: direction,
			});
			expect(compiled.read.sort.map((part) => part.direction)).toEqual([direction, 'asc']);
		}
	);

	it('adds the Woo id tiebreak to the variations menu_order sort (#871)', () => {
		const state = {
			search: '',
			filters: { attributeMatches: [] },
			sort: { field: 'menu_order', direction: 'asc' },
			limit: 10,
		} as unknown as QueryStateOf<'variations'>;

		expect(compileQuery('variations', state, { id: 'variations' }).read.sort).toHaveLength(2);
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

	it('compiles every products filter into equivalent wire and read faces', () => {
		const products = compileQuery(
			'products',
			{
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
			} satisfies QueryStateOf<'products'>,
			{ id: 'products' }
		);
		expect(products.read.prefilter).toEqual({
			$and: [
				{ categoryIds: { $in: [2, 7] } },
				{ brandIds: { $in: [9] } },
				{ featured: true },
				{ onSale: false },
				{ stockStatus: 'outofstock' },
				{ 'payload.status': 'publish' },
			],
		});
		expect(products.demand[0]).toMatchObject({
			category: [2, 7],
			tag: [5],
			brand: [9],
			featured: true,
			on_sale: false,
			stock_status: 'outofstock',
			orderby: 'price',
			order: 'desc',
			limit: 25,
		});
		expect(products.represented).toBe(true);
		expect(products.read.complete).toBe(false);
	});

	it('composes order payload metadata with promoted filters and dates', () => {
		const compiled = compileQuery(
			'orders',
			{
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
			} satisfies QueryStateOf<'orders'>,
			{ id: 'orders' }
		);

		expect(compiled.read.prefilter).toEqual({
			$and: [
				{ status: 'processing' },
				{ customerId: 42 },
				{ dateCreatedGmt: { $gte: '2026-07-01', $lte: '2026-07-14' } },
			],
		});
		expect(compiled.demand[0]).toMatchObject({
			status: 'processing',
			customerId: 42,
			cashierId: 7,
			store: '3',
			search: 'smith',
		});
	});

	it('normalizes cashier ids before matching order metadata', () => {
		const compiled = compileQuery(
			'orders',
			{
				search: '',
				filters: { cashier: ' 0007 ' },
				sort: { field: 'date_created_gmt', direction: 'desc' },
				limit: 50,
			} satisfies QueryStateOf<'orders'>,
			{ id: 'orders' }
		);

		expect(compiled.demand[0]).toMatchObject({ cashierId: 7 });
	});

	it('sorts order totals through the numeric adapter field', () => {
		const compiled = compileQuery(
			'orders',
			{
				search: '',
				filters: {},
				sort: { field: 'total', direction: 'asc' },
				limit: 50,
			} satisfies QueryStateOf<'orders'>,
			{ id: 'orders' }
		);

		expect(compiled.demand[0]).toMatchObject({
			orderby: 'total',
			order: 'asc',
		});
		expect(compiled.read.sortPushable).toBe(false);
	});

	it('preserves the legacy mutually-exclusive created_via and _pos_store selector branches', () => {
		const base = {
			search: '',
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 10,
		} as const;

		expect(
			compileQuery('orders', { ...base, filters: { store: '12' } }, { id: 'orders' }).demand[0]
		).toMatchObject({ store: '12' });
		expect(
			compileQuery('orders', { ...base, filters: { store: 'checkout' } }, { id: 'orders' })
				.demand[0]
		).toMatchObject({ store: 'checkout' });
	});

	it('compiles order demand fields without a selector bridge', () => {
		const compiled = compileQuery(
			'orders',
			{
				search: '',
				filters: {
					status: 'processing',
					customer_id: 42,
					dateRange: { from: '2026-07-01', to: '2026-07-14' },
				},
				sort: { field: 'date_created_gmt', direction: 'desc' },
				limit: 50,
			} satisfies QueryStateOf<'orders'>,
			{ id: 'orders-binding' }
		);
		expect(compiled.demand[0]).toMatchObject({
			status: 'processing',
			customerId: 42,
			afterSeconds: 1782864000,
			beforeSeconds: 1783987200,
		});
	});

	it('keeps the completed reports date window representable as orders demand', () => {
		const compiled = compileQuery(
			'orders',
			{
				search: '',
				filters: {
					status: 'completed',
					cashier: '7',
					store: '12',
					dateRange: {
						from: '2026-07-15T00:00:00.000Z',
						to: '2026-07-15T23:59:59.999Z',
					},
				},
				sort: { field: 'date_created_gmt', direction: 'desc' },
				limit: Number.MAX_SAFE_INTEGER,
			} satisfies QueryStateOf<'orders'>,
			{ id: 'reports-orders-binding' }
		);

		expect({
			requirements: compiled.demand,
			represented: compiled.represented,
		}).toEqual({
			requirements: [
				{
					id: 'reports-orders-binding:orders-browse',
					collection: 'orders',
					kind: 'orders-browse',
					status: 'completed',
					cashierId: 7,
					store: '12',
					afterSeconds: 1784073600,
					beforeSeconds: 1784159999,
					orderby: 'date',
					order: 'desc',
					limit: 'all',
					priority: 700,
				},
			],
			represented: true,
		});
	});

	it('resolves every sort of one reports range to a single lane key', () => {
		const keyFor = (field: QueryStateOf<'orders'>['sort']['field']) => {
			const compiled = compileQuery(
				'orders',
				{
					search: '',
					filters: {
						status: 'completed',
						dateRange: {
							from: '2026-07-01T00:00:00',
							to: '2026-07-14T23:59:59',
						},
					},
					sort: { field, direction: field === 'total' ? 'asc' : 'desc' },
					limit: Number.MAX_SAFE_INTEGER,
				},
				{ id: 'reports' }
			);
			return orderBrowserQueryKey(compiled.demand[0] as never);
		};

		const byDate = keyFor('date_created_gmt');
		expect(byDate).toBe(
			'orders:browser:status=completed:after=1782864000:before=1784073599:search=:limit=all'
		);
		expect(keyFor('total')).toBe(byDate);
		expect(keyFor('number')).toBe(byDate);
	});

	it('still forks a windowed browse lane per sort', () => {
		const keyFor = (direction: 'asc' | 'desc') => {
			const compiled = compileQuery(
				'orders',
				{
					search: '',
					filters: {},
					sort: { field: 'total', direction },
					limit: 25,
				},
				{ id: 'orders' }
			);
			return orderBrowserQueryKey(compiled.demand[0] as never);
		};

		expect(keyFor('asc')).not.toBe(keyFor('desc'));
		expect(keyFor('asc')).toContain(':orderby=total:order=asc');
	});

	it('compiles product wire, read, and sort faces together', () => {
		const compiled = compileQuery(
			'products',
			{
				search: '  shirt  ',
				filters: {
					categories: [7, 2, 7],
					tags: [],
					brands: [],
					stock_status: 'instock',
					status: 'publish',
				},
				sort: { field: 'price', direction: 'desc' },
				limit: 25,
			},
			{ id: 'products-binding' }
		);

		expect(compiled.demand).toEqual([
			{
				id: 'products-binding:search',
				collection: 'products',
				kind: 'search',
				term: 'shirt',
				limit: 25,
			},
		]);
		expect(compiled.represented).toBe(false);
		expect(compiled.read).toMatchObject({
			prefilter: {
				$and: [
					{ categoryIds: { $in: [2, 7] } },
					{ stockStatus: 'instock' },
					{ 'payload.status': 'publish' },
				],
			},
			complete: true,
			sortPushable: false,
			skip: 0,
			limit: 25,
			search: 'shirt',
		});
	});

	it('keeps empty targeting distinct from an untargeted customer browse', () => {
		const compiled = compileQuery(
			'customers',
			{
				search: '',
				filters: {},
				sort: { field: 'id', direction: 'asc' },
				limit: 10,
			},
			{ id: 'guest', targeted: [] }
		);

		expect(compiled.demand).toEqual([]);
		expect(compiled.represented).toBe(false);
		expect(compiled.read.prefilter).toEqual({ wooCustomerId: { $in: [] } });
	});

	it('keeps forceRefresh kind-sensitive when compiled demand is re-declared', () => {
		const refresh = compileQuery(
			'coupons',
			{
				search: '',
				filters: {},
				sort: { field: 'code', direction: 'asc' },
				limit: 20,
			},
			{ id: 'coupons' }
		);
		const product = compileQuery(
			'products',
			{
				search: '',
				filters: { categories: [], tags: [], brands: [] },
				sort: { field: 'id', direction: 'asc' },
				limit: 20,
			},
			{ id: 'products' }
		);

		expect(
			requirementsForCompiledQuery(refresh.demand, { id: 'coupons:sync', forceRefresh: true })
		).toEqual([
			{
				id: 'coupons:sync:reference-refresh',
				collection: 'coupons',
				kind: 'refresh',
				priority: 700,
			},
		]);
		expect(
			requirementsForCompiledQuery(product.demand, { id: 'products:sync', forceRefresh: true })
		).toEqual([
			expect.objectContaining({
				id: 'products:sync:products-browse-window',
				forceRefresh: true,
			}),
		]);
	});
});

describe('logs preset filters', () => {
	const base = {
		search: '',
		sort: { field: 'timestamp', direction: 'desc' },
		limit: 20,
	} as const;

	it('translates the sync preset to an index-friendly category prefix range', () => {
		const translated = translateLogsQueryState({
			...base,
			filters: {
				level: ['info', 'warn', 'error'],
				category_prefix: 'wcpos.sync',
			},
		} satisfies QueryStateOf<'logs'>);

		expect(translated.selector).toEqual({
			$and: [
				{ level: { $in: ['info', 'warn', 'error'] } },
				{ category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' } },
			],
		});
	});

	it('translates the actions preset to an actor-existence predicate', () => {
		const translated = translateLogsQueryState({
			...base,
			filters: { level: ['info', 'warn', 'error'], has_actor: true },
		} satisfies QueryStateOf<'logs'>);

		expect(translated.selector).toEqual({
			$and: [{ level: { $in: ['info', 'warn', 'error'] } }, { actor: { $exists: true } }],
		});
	});

	it('drops a false has_actor filter entirely', () => {
		const translated = translateLogsQueryState({
			...base,
			filters: { level: ['error'], has_actor: false },
		} satisfies QueryStateOf<'logs'>);

		expect(translated.selector).toEqual({
			$and: [{ level: { $in: ['error'] } }],
		});
	});
});
