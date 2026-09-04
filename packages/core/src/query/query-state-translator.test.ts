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
	[C in Exclude<CollectionKey, 'logs'>]: { [F in keyof FiltersOf<C>]-?: unknown };
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
			'price',
			'type',
		]);
	});

	it.each([
		[{ min: 10 }, { price: { $gte: 10 } }],
		[{ max: 20 }, { price: { $lte: 20 } }],
		[{ min: 10, max: 20 }, { price: { $gte: 10, $lte: 20 } }],
	] as const)(
		'compiles the product price range %j into a promoted prefilter',
		(price, prefilter) => {
			const compiled = compileQuery(
				'products',
				{
					search: '',
					filters: { categories: [], tags: [], brands: [], price },
					sort: { field: 'id', direction: 'asc' },
					limit: 25,
				} satisfies QueryStateOf<'products'>,
				{ id: 'products' }
			);

			expect(compiled.read.prefilter).toEqual(prefilter);
		}
	);

	it('matches product price and type filters locally and carries them into demand', () => {
		const compiled = compileQuery(
			'products',
			{
				search: '',
				filters: {
					categories: [],
					tags: [],
					brands: [],
					price: { min: 10, max: 20 },
					type: 'variable',
				},
				sort: { field: 'id', direction: 'asc' },
				limit: 25,
			} satisfies QueryStateOf<'products'>,
			{ id: 'products' }
		);

		expect(
			compiled.read.residual({ uuid: '15', price: 15, type: 'variable', payload: { price: '15' } })
		).toBe(true);
		expect(
			compiled.read.residual({ uuid: '9', price: 9, type: 'variable', payload: { price: '9' } })
		).toBe(false);
		expect(
			compiled.read.residual({ uuid: 'type', price: 15, type: 'simple', payload: { price: '15' } })
		).toBe(false);
		expect(compiled.demand[0]).toMatchObject({
			min_price: 10,
			max_price: 20,
			type: 'variable',
			priority: 700,
		});
		expect(compiled.represented).toBe(true);
	});

	it('ignores non-finite price bounds and rejects an unsupported product type on demand', () => {
		const compiled = compileQuery(
			'products',
			{
				search: '',
				filters: {
					categories: [],
					tags: [],
					brands: [],
					price: { min: Number.NaN, max: Number.POSITIVE_INFINITY },
					type: 'bundle',
				},
				sort: { field: 'id', direction: 'asc' },
				limit: 25,
			} satisfies QueryStateOf<'products'>,
			{ id: 'products' }
		);

		expect(compiled.read.prefilter).toEqual({ type: 'bundle' });
		expect(compiled.demand[0]).not.toHaveProperty('min_price');
		expect(compiled.demand[0]).not.toHaveProperty('max_price');
		expect(compiled.demand[0]).not.toHaveProperty('type');
		expect(compiled.represented).toBe(false);
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
				{ $or: [{ 'payload.tags': { $elemMatch: { id: 5 } } }] },
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
		expect(products.read.complete).toBe(true);
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
				{
					'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '7' } },
				},
				{
					'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '3' } },
				},
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

	it('keeps cashier, store, and date grid reads complete and pushable', () => {
		const compiled = compileQuery(
			'orders',
			{
				search: '',
				filters: {
					cashier: 7,
					store: 3,
					dateRange: { from: '2026-07-01', to: '2026-07-14' },
				},
				sort: { field: 'date_created_gmt', direction: 'desc' },
				limit: 50,
			},
			{ id: 'orders' }
		);

		expect(compiled.read).toMatchObject({
			prefilter: {
				$and: [
					{
						'payload.meta_data': { $elemMatch: { key: '_pos_user', value: '7' } },
					},
					{
						'payload.meta_data': { $elemMatch: { key: '_pos_store', value: '3' } },
					},
					{ dateCreatedGmt: { $gte: '2026-07-01', $lte: '2026-07-14' } },
				],
			},
			complete: true,
			sortPushable: true,
		});
	});

	it('keeps prior scoping and omits undefined range fields for a malformed later range', () => {
		const requirement = compileQuery(
			'orders',
			{
				search: '',
				filters: {
					cashier: 7,
					store: 'checkout',
					dateRange: { from: 'not-a-date', to: 'also-not-a-date' },
				},
				sort: { field: 'date_created_gmt', direction: 'desc' },
				limit: 50,
			},
			{ id: 'orders' }
		).demand[0]!;

		expect(requirement).toMatchObject({ cashierId: 7, store: 'checkout', priority: 700 });
		expect(requirement).not.toHaveProperty('afterSeconds');
		expect(requirement).not.toHaveProperty('beforeSeconds');
	});

	it('accepts an empty order status as a represented bare value', () => {
		const compiled = compileQuery(
			'orders',
			{
				search: '',
				filters: { status: '' },
				sort: { field: 'date_created_gmt', direction: 'desc' },
				limit: 50,
			},
			{ id: 'orders' }
		);

		expect(compiled.demand[0]).toMatchObject({ status: '' });
		expect(compiled.represented).toBe(true);
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
			limit: 25,
			search: 'shirt',
		});
	});

	it('pushes payload taxonomies without forcing the residual slow path', () => {
		const compiled = compileQuery(
			'products',
			{
				search: '',
				filters: { categories: [], tags: [5, 9], brands: [] },
				sort: { field: 'id', direction: 'asc' },
				limit: 25,
			},
			{ id: 'products' }
		);

		expect(compiled.read.prefilter).toEqual({
			$or: [
				{ 'payload.tags': { $elemMatch: { id: 5 } } },
				{ 'payload.tags': { $elemMatch: { id: 9 } } },
			],
		});
		expect(compiled.read.complete).toBe(true);
	});

	it.each([
		['unsupported stock status', { stock_status: 'weird' }],
		['invalid category id', { categories: [0] }],
	] as [string, Partial<FiltersOf<'products'>>][])(
		'does not prioritize or dimension %s',
		(_name, filters) => {
			const compiled = compileQuery(
				'products',
				{
					search: '',
					filters: { categories: [], tags: [], brands: [], ...filters },
					sort: { field: 'id', direction: 'asc' },
					limit: 25,
				},
				{ id: 'products' }
			);

			expect(compiled.demand[0]).not.toHaveProperty('priority');
			expect(compiled.demand[0]).not.toHaveProperty('category');
			expect(compiled.represented).toBe(false);
		}
	);

	// #947, Paul's ruling 2026-08-14: both product lists sort by type. `type` is the one
	// product sort with no wire `orderby` (core Woo's enum rejects it and the WCPOS plugin
	// adds no extension for it), so the demand stays the DEFAULT browse window while the
	// ordering is served locally off the promoted `type` column. What must never happen is
	// the window silently carrying some other column's order under the Type heading — so this
	// pins both halves: no wire orderby, and a real pushed-down engine sort on `type`.
	it('serves the product type sort locally off the promoted column (#947)', () => {
		const compiled = compileQuery(
			'products',
			{
				search: '',
				filters: { categories: [], tags: [], brands: [] },
				sort: { field: 'type', direction: 'asc' },
				limit: 25,
			} satisfies QueryStateOf<'products'>,
			{ id: 'products' }
		);

		expect(compiled.read.sortPushable).toBe(true);
		expect(compiled.read.sort).toEqual([
			expect.objectContaining({ direction: 'asc', enginePath: 'type' }),
		]);
		expect(compiled.read.sort[0].value({ type: 'variable' } as never)).toBe('variable');
		// The browse window keeps its default ordering — the bridge declares no `orderby`
		// rather than inventing one the server would reject.
		expect(compiled.demand[0]).toMatchObject({ kind: 'product-browse' });
		expect(compiled.demand[0]).not.toHaveProperty('orderby');
	});

	it('keeps variation attribute matching entirely residual for wildcard variations', () => {
		const compiled = compileQuery(
			'variations',
			{
				search: '',
				filters: { attributeMatches: [{ id: 1, name: 'Color', option: 'Red' }] },
				sort: { field: 'id', direction: 'asc' },
				limit: 25,
			},
			{ id: 'variations' }
		);

		expect(compiled.read.prefilter).toEqual({});
		expect(compiled.read.complete).toBe(false);
	});

	it('excludes variations missing a payload attributes array under an active filter (#811)', () => {
		const compiled = compileQuery(
			'variations',
			{
				search: '',
				filters: { attributeMatches: [{ id: 1, name: 'Color', option: 'Red' }] },
				sort: { field: 'id', direction: 'asc' },
				limit: 25,
			},
			{ id: 'variations' }
		);
		const attributes = [{ id: 1, name: 'Color', option: 'Red' }];

		expect(compiled.read.residual({ uuid: 'missing', attributes: [], payload: {} })).toBe(false);
		expect(compiled.read.residual({ uuid: 'matching', attributes, payload: { attributes } })).toBe(
			true
		);
	});

	it.each([
		['orders', true, 'orders-browse'],
		['products', false, 'search'],
		['customers', false, 'search'],
		['variations', false, 'search'],
	] as const)(
		'preserves the %s 1-2 character search semantics',
		(collection, represented, kind) => {
			const states = {
				orders: {
					search: 'ab',
					filters: {},
					sort: { field: 'date_created_gmt', direction: 'desc' },
					limit: 25,
				} satisfies QueryStateOf<'orders'>,
				products: {
					search: 'ab',
					filters: { categories: [], tags: [], brands: [] },
					sort: { field: 'id', direction: 'asc' },
					limit: 25,
				} satisfies QueryStateOf<'products'>,
				customers: {
					search: 'ab',
					filters: {},
					sort: { field: 'id', direction: 'asc' },
					limit: 25,
				} satisfies QueryStateOf<'customers'>,
				variations: {
					search: 'ab',
					filters: { attributeMatches: [] },
					sort: { field: 'id', direction: 'asc' },
					limit: 25,
				} satisfies QueryStateOf<'variations'>,
			};
			const compiled = compileQuery(collection, states[collection], { id: collection });

			expect(compiled.represented).toBe(represented);
			expect(compiled.demand[0]).toMatchObject({ kind });
		}
	);

	/**
	 * A customers sort with no wire `orderby` — `date_modified_gmt`, the one such column on the
	 * customers grid — used to gate the WHOLE branch off and declare no demand at all, so the
	 * grid locally re-ordered whichever residents the trickle happened to hold: the
	 * plausible-looking-but-wrong slice #909/#951 introduced browse windows to prevent. It must
	 * fall back exactly as products do — the window is still declared, with the sort omitted.
	 */
	it('declares a customers browse window for a sort the wire cannot express', () => {
		const compiled = compileQuery(
			'customers',
			{
				search: '',
				filters: {},
				sort: { field: 'date_modified_gmt', direction: 'desc' },
				limit: 25,
			},
			{ id: 'customers' }
		);

		expect(compiled.demand).toEqual([
			{
				id: 'customers:customers-browse-window',
				collection: 'customers',
				kind: 'customer-browse',
				limit: 25,
			},
		]);
	});

	it('carries an expressible customers sort onto the browse window', () => {
		const compiled = compileQuery(
			'customers',
			{
				search: '',
				filters: {},
				sort: { field: 'last_name', direction: 'desc' },
				limit: 25,
			},
			{ id: 'customers' }
		);

		expect(compiled.demand[0]).toMatchObject({
			kind: 'customer-browse',
			orderby: 'last_name',
			order: 'desc',
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
		expect(compiled.read.prefilter).toEqual({ remoteId: { $in: [] } });
	});

	it('states the picker sort on a reference refresh when the wire can express it (#1347)', () => {
		const categories = compileQuery(
			'products/categories',
			{
				search: '',
				filters: {},
				sort: { field: 'name', direction: 'asc' },
				limit: 10,
			},
			{ id: 'category-picker' }
		);
		expect(categories.demand[0]).toMatchObject({
			kind: 'refresh',
			collection: 'categories',
			orderby: 'name',
			order: 'asc',
		});

		const coupons = compileQuery(
			'coupons',
			{
				search: '',
				filters: {},
				sort: { field: 'date_created_gmt', direction: 'desc' },
				limit: 10,
			},
			{ id: 'coupons-grid' }
		);
		expect(coupons.demand[0]).toMatchObject({
			kind: 'refresh',
			collection: 'coupons',
			orderby: 'date',
			order: 'desc',
		});

		// The coupon picker's `code` rides the wire as `title` — a coupon's
		// post_title IS its code, and `title` is in the native wc/v3 enum.
		const picker = compileQuery(
			'coupons',
			{
				search: '',
				filters: {},
				sort: { field: 'code', direction: 'asc' },
				limit: 10,
			},
			{ id: 'coupon-picker' }
		);
		expect(picker.demand[0]).toMatchObject({
			kind: 'refresh',
			collection: 'coupons',
			orderby: 'title',
			order: 'asc',
		});
	});

	it('omits the sort ENTIRELY when the wire cannot express it — the engine reads absence as "no opinion"', () => {
		const compiled = compileQuery(
			'coupons',
			{
				search: '',
				filters: {},
				sort: { field: 'amount', direction: 'asc' },
				limit: 10,
			},
			{ id: 'coupon-picker' }
		);
		expect(compiled.demand[0]).toMatchObject({ kind: 'refresh', collection: 'coupons' });
		expect(Object.keys(compiled.demand[0] ?? {})).not.toContain('orderby');
		expect(Object.keys(compiled.demand[0] ?? {})).not.toContain('order');
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
				orderby: 'title',
				order: 'asc',
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

	// A1.5 (map #1136): the LEVEL-pill kind filter is a STRICT display-kind
	// match — each selector mirrors displayKind's precedence exactly.
	describe('kind filter', () => {
		it('intersects the kind with the active preset (compose, not replace)', () => {
			const translated = translateLogsQueryState({
				...base,
				filters: {
					level: ['info', 'warn', 'error'],
					category_prefix: 'wcpos.sync',
					kind: 'warn',
				},
			} satisfies QueryStateOf<'logs'>);

			expect(translated.selector).toEqual({
				$and: [
					{ level: { $in: ['info', 'warn', 'error'] } },
					{ category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' } },
					{ level: 'warn' },
				],
			});
		});

		it('translates the action kind as identified-actor rows below severity', () => {
			const translated = translateLogsQueryState({
				...base,
				filters: { kind: 'action' },
			} satisfies QueryStateOf<'logs'>);

			// displayKind ignores actor: null and role-only actors — the selector
			// probes the identifying fields, not the object.
			expect(translated.selector).toEqual({
				$and: [
					{ $or: [{ 'actor.id': { $exists: true } }, { 'actor.name': { $exists: true } }] },
					{ level: { $nin: ['error', 'warn'] } },
				],
			});
		});

		it('translates the sync kind as the domain minus acting actors, severity AND debug rows', () => {
			const translated = translateLogsQueryState({
				...base,
				filters: { kind: 'sync' },
			} satisfies QueryStateOf<'logs'>);

			// Debug outranks the domain in displayKind, so a sync-domain debug row
			// renders as debug and must NOT come back under the sync pill.
			expect(translated.selector).toEqual({
				$and: [
					{ category: { $gte: 'wcpos.sync', $lt: 'wcpos.sync/' } },
					{ 'actor.id': { $exists: false } },
					{ 'actor.name': { $exists: false } },
					{ level: { $nin: ['error', 'warn', 'debug'] } },
				],
			});
		});

		it('translates the debug kind as every diagnostic row, sync domain included', () => {
			const translated = translateLogsQueryState({
				...base,
				filters: { kind: 'debug' },
			} satisfies QueryStateOf<'logs'>);

			// Nearly every debug row IS a sync-domain row (transport, drain, change
			// signal). Excluding the domain here left the pill matching almost
			// nothing while the rows it named sat under the sync pill.
			expect(translated.selector).toEqual({
				$and: [
					{ level: 'debug' },
					{ 'actor.id': { $exists: false } },
					{ 'actor.name': { $exists: false } },
				],
			});
		});

		it('translates the info kind as the residual: absent and unknown levels, no actor, no category', () => {
			const translated = translateLogsQueryState({
				...base,
				filters: { kind: 'info' },
			} satisfies QueryStateOf<'logs'>);

			// info absorbs rows with NO level and NO category — displayKind renders
			// both as info, so the strict selector must keep them.
			expect(translated.selector).toEqual({
				$and: [
					{ level: { $nin: ['error', 'warn', 'debug'] } },
					{ 'actor.id': { $exists: false } },
					{ 'actor.name': { $exists: false } },
					{
						$or: [
							{ category: { $exists: false } },
							{ category: { $lt: 'wcpos.sync' } },
							{ category: { $gte: 'wcpos.sync/' } },
						],
					},
				],
			});
		});
	});
});
