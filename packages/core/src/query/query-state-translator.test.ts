import { Query } from 'mingo';

import { engineOrder, orderBrowserQueryKey } from '@wcpos/query/testing';
import { engineCollectionNameFor, type EngineDocument } from '@wcpos/query/collection-map';
import { mintRemoteId } from '@wcpos/sync-core';
import { engineCollectionCreators, engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import {
	compileQuery,
	FILTER_TRANSLATORS,
	normalizeQuerySortField,
	requirementsForCompiledQuery,
	translateLogsQueryState,
} from './query-state-translator';

import type { CollectionKey, FiltersOf, QueryStateOf, SortFieldOf } from './query-state-types';
import type { RxJsonSchema } from 'rxdb';

type ExhaustiveFilterMap = {
	[C in Exclude<CollectionKey, 'logs'>]: { [F in keyof FiltersOf<C>]-?: unknown };
};

// This assignment is intentionally part of the compile gate: adding a FiltersOf field
// without a translator entry makes this suite fail before it can run.
const exhaustiveFilterMap: ExhaustiveFilterMap = FILTER_TRANSLATORS;

// Required keys cannot be absent. Nullable is allowed: null precedes all values on both engines.
it('pushes only required top-level engine columns for every UI sort', () => {
	type Collection = Exclude<CollectionKey, 'logs'>;
	const dated = ['date_created_gmt', 'date_modified_gmt'] as const;
	const prices = ['price', 'regular_price', 'sale_price'] as const;
	const stock = ['stock_quantity', 'stock_status'] as const;
	const fields = {
		refunds: ['date_created_gmt'],
		products: [
			'id',
			'name',
			'sku',
			'barcode',
			'sortable_price',
			'total_sales',
			'menu_order',
			'type',
			...prices,
			...stock,
			...dated,
		],
		orders: [
			'status',
			'number',
			'customer_id',
			'total',
			'date_completed_gmt',
			'date_paid_gmt',
			'payment_method',
			...dated,
		],
		coupons: [
			'code',
			'amount',
			'discount_type',
			'status',
			'usage_count',
			'date_expires_gmt',
			...dated,
		],
		'products/categories': ['id', 'name'],
		'products/brands': ['id', 'name'],
		'products/tags': ['id', 'name'],
		variations: ['id', 'name', 'sku', 'menu_order', ...prices, ...stock, ...dated],
		customers: ['id', 'first_name', 'last_name', 'email', 'role', 'username', ...dated],
		'tax-rates': ['id', 'name', 'country', 'state', 'priority', 'rate', 'class', 'order'],
	} satisfies { [C in Collection]: SortFieldOf<C>[] };
	const creators = engineSyncCollectionCreators();
	const violations: string[] = [];
	for (const [name, { schema }] of Object.entries(engineCollectionCreators())) {
		const typed = schema as RxJsonSchema<Record<string, unknown>>;
		for (const index of typed.indexes ?? [])
			for (const path of typeof index === 'string' ? [index] : index) {
				const parts = path.split('.');
				let node = typed;
				for (const part of parts) {
					if (!node.required?.includes(part)) violations.push(`${name}.${path}: not required`);
					node = node.properties[part] as RxJsonSchema<Record<string, unknown>>;
				}
				if (typeof node.type !== 'string' || node.type === 'null')
					violations.push(`${name}.${path}: nullable`);
			}
	}
	for (const name of [
		'orders',
		'products',
		'variations',
		'customers',
		'taxRates',
		'categories',
		'brands',
		'tags',
		'coupons',
	] as const) {
		const schema = creators[name].schema as RxJsonSchema<Record<string, unknown>>;
		if (!schema.indexes?.includes('remoteKey')) violations.push(`${name}: missing remoteKey index`);
	}

	for (const collection of Object.keys(fields) as Collection[]) {
		const legacy = collection === 'tax-rates' ? 'taxes' : collection;
		const schema = creators[engineCollectionNameFor(legacy)].schema as RxJsonSchema<
			Record<string, unknown>
		>;
		for (const field of fields[collection]) {
			const { read } = compileQuery(
				collection,
				{
					search: '',
					filters: {},
					sort: { field, direction: 'asc' },
					limit: 10,
				},
				{ id: 'sort-schema-pin' }
			);
			if (!read.sortPushable) continue;
			for (const { enginePath } of read.sort) {
				const property = enginePath === undefined ? undefined : schema.properties[enginePath];
				if (!property || !schema.required?.includes(enginePath!))
					violations.push(`${collection}.${field} -> ${enginePath}`);
			}
		}
	}
	expect(violations).toEqual([]);
});

describe('query-state translator', () => {
	// Remove the refunds-by-parent suffix: re-declaration produces an undefined requirement id.
	it('gives re-declared parent refund demand a stable id and forced refresh', () => {
		expect(
			requirementsForCompiledQuery(
				[
					{
						id: 'old',
						kind: 'refunds-by-parent',
						collection: 'refunds',
						parentRemoteId: mintRemoteId(42, 'test'),
					},
				],
				{ id: 'detail', forceRefresh: true }
			)
		).toEqual([
			{
				id: 'detail:refunds-by-parent',
				kind: 'refunds-by-parent',
				collection: 'refunds',
				parentRemoteId: '42',
				forceRefresh: true,
			},
		]);
	});
	it.each([
		['name', 'name'],
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
				{ tagIds: { $in: [5] } },
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
					posUserId: '7',
				},
				{
					posStoreId: '3',
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
						posUserId: '7',
					},
					{
						posStoreId: '3',
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

	// These assertions catch widening only the residual, admitting foreign POS, or leaking store on wire.
	describe('sales store scope', () => {
		const base = {
			search: '',
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: Number.MAX_SAFE_INTEGER,
		} as const;
		const fixtures = [
			engineOrder({
				uuid: 'local',
				created_via: 'woocommerce-pos',
				meta_data: [{ key: '_pos_store', value: '12' }],
			}),
			engineOrder({
				uuid: 'foreign',
				created_via: 'woocommerce-pos',
				meta_data: [{ key: '_pos_store', value: '13' }],
			}),
			engineOrder({ uuid: 'free', created_via: 'woocommerce-pos' }),
			engineOrder({ uuid: 'checkout', created_via: 'checkout' }),
			engineOrder({
				uuid: 'admin',
				created_via: 'admin',
				meta_data: [{ key: '_pos_store', value: '13' }],
			}),
			engineOrder({ uuid: 'missing' }),
		] as EngineDocument[];
		it("storeScope sales widens a numeric store to the site's non-POS orders (prefilter and residual)", () => {
			const { read } = compileQuery(
				'orders',
				{ ...base, filters: { store: '12' } },
				{ id: 'sales', storeScope: 'sales' }
			);
			expect(read.complete).toBe(true);
			expect(
				fixtures.filter((row) => new Query(read.prefilter).test(row)).map((row) => row.uuid)
			).toEqual(['local', 'checkout', 'admin', 'missing']);
			expect(fixtures.filter(read.residual).map((row) => row.uuid)).toEqual([
				'local',
				'checkout',
				'admin',
				'missing',
			]);
		});
		it('storeScope sales widens the woocommerce-pos sentinel the same way', () => {
			const { read } = compileQuery(
				'orders',
				{ ...base, filters: { store: 'woocommerce-pos' } },
				{ id: 'sales', storeScope: 'sales' }
			);
			expect(fixtures.every((row) => new Query(read.prefilter).test(row))).toBe(true);
			expect(fixtures.every(read.residual)).toBe(true);
		});
		it("storeScope sales excludes another store's POS orders", () => {
			const { read } = compileQuery(
				'orders',
				{ ...base, filters: { store: '12' } },
				{ id: 'sales', storeScope: 'sales' }
			);
			expect(new Query(read.prefilter).test(fixtures[1])).toBe(false);
			expect(read.residual(fixtures[1])).toBe(false);
		});
		it('storeScope sales with a register filter compiles as pos', () => {
			for (const store of ['12', 'woocommerce-pos']) {
				const state = { ...base, filters: { store, register: 'front' } };
				const pos = compileQuery('orders', state, { id: 'same' });
				const sales = compileQuery('orders', state, { id: 'same', storeScope: 'sales' });
				expect(sales.demand).toEqual(pos.demand);
				expect(sales.represented).toBe(pos.represented);
				expect(sales.coverage ?? 'exact').toBe('exact');
				expect(sales.read.prefilter).toEqual(pos.read.prefilter);
				expect(fixtures.map(sales.read.residual)).toEqual(fixtures.map(pos.read.residual));
			}
		});
		it('storeScope sales omits the store dimension from the orders-browse demand and reports represented false', () => {
			const compiled = compileQuery(
				'orders',
				{
					...base,
					filters: {
						store: '12',
						cashier: '7',
						status: 'completed',
						dateRange: { from: '2026-07-01', to: '2026-07-14' },
					},
				},
				{ id: 'sales', storeScope: 'sales' }
			);
			expect(compiled.demand).toEqual([
				{
					id: 'sales:orders-browse',
					collection: 'orders',
					kind: 'orders-browse',
					cashierId: 7,
					status: 'completed',
					afterSeconds: 1782864000,
					beforeSeconds: 1783987200,
					orderby: 'date',
					order: 'desc',
					limit: 'all',
					priority: 700,
				},
			]);
			expect(compiled.represented).toBe(false);
			expect(compiled.coverage).toBe('superset');
			expect(fixtures.filter(compiled.read.residual)).toEqual([]);
		});
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

	it('pushes tag membership to the promoted tagIds column, not a payload scan', () => {
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

		expect(compiled.read.prefilter).toEqual({ tagIds: { $in: [5, 9] } });
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
		expect(compiled.read.prefilter).toEqual({ remoteKey: { $in: [] } });
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

it('translates the register into both metadata reads and browse demand', () => {
	const register = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
	const compiled = compileQuery(
		'orders',
		{
			filters: { register },
			search: '',
			limit: 10,
			sort: { field: 'date_created_gmt', direction: 'desc' },
		},
		{ id: 'orders' }
	);
	expect(compiled.demand[0]).toMatchObject({ registerId: register });
	expect(compiled.read.prefilter).toEqual({
		'payload.meta_data': { $elemMatch: { key: '_wcpos_register', value: register } },
	});
});

it.each(['products', 'variations'] as const)(
	'bounds the default %s grid in storage',
	(collection) => {
		const { read } = compileQuery(
			collection,
			{
				search: '',
				filters: { categories: [], tags: [], brands: [] },
				sort: { field: 'name', direction: 'asc' },
				limit: 10,
			},
			{ id: 'default-grid' }
		);
		expect(read.sortPushable).toBe(true);
		expect(read.limit).toBe(10);
		expect(Number.isFinite(read.limit)).toBe(true);
		expect(read.sort.map(({ enginePath }) => enginePath)).toEqual(['sortName', 'uuid']);
	}
);

describe('refund query state', () => {
	const state: QueryStateOf<'refunds'> = {
		search: '',
		filters: { dateRange: { from: '2026-09-01T00:00:00', to: '2026-09-03T00:00:00' } },
		sort: { field: 'date_created_gmt', direction: 'desc' },
		limit: Number.MAX_SAFE_INTEGER,
	};
	it('a refunds query-state with a date range becomes a refunds-browse requirement', () => {
		const compiled = compileQuery('refunds', state, { id: 'report' });
		expect(compiled.demand).toEqual([
			{
				id: 'report:refunds-browse',
				collection: 'refunds',
				kind: 'refunds-browse',
				after: 1788220800,
				before: 1788393600,
				limit: 'all',
				priority: 700,
			},
		]);
		expect(compiled.represented).toBe(true);
	});
	it.each([
		['2026-08-31T23:59:59', false],
		['2026-09-01T00:00:00', true],
		['2026-09-03T00:00:00', true],
		['2026-09-03T00:00:01', false],
	])('local refund date predicate includes both bounds: %s', (date, included) => {
		const compiled = compileQuery('refunds', state, { id: 'report' });
		expect(compiled.read.residual?.({ uuid: 'refund', payload: { date_created_gmt: date } })).toBe(
			included
		);
	});
	it('missing or invalid bounds never become a history walk', () => {
		for (const filters of [{}, { dateRange: { from: 'invalid', to: '2026-09-03' } }]) {
			const compiled = compileQuery('refunds', { ...state, filters }, { id: 'report' });
			expect(compiled.demand).toEqual([]);
			expect(compiled.represented).toBe(false);
		}
	});
	it('does not claim unsupported search or finite ascending slices are represented', () => {
		for (const update of [
			{ search: 'text' },
			{ limit: 10, sort: { field: 'date_created_gmt', direction: 'asc' } },
		] as const) {
			expect(compileQuery('refunds', { ...state, ...update }, { id: 'report' }).represented).toBe(
				false
			);
		}
	});
});
