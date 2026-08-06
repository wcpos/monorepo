import type { EngineRequirement } from '@wcpos/sync-engine';

import { declareRequirements, requirementsForQuery } from '../src/requirement-bridge';
import { createEngineDatabase, createFakeEngine } from '../src/testing';

import type { RequirementInput, RequirementPlan } from '../src/requirement-bridge';
import type { RxDatabase } from 'rxdb';

const input = (overrides: Partial<RequirementInput> = {}): RequirementInput => ({
	id: 'q',
	collectionName: 'products',
	selector: {},
	limit: 10,
	...overrides,
});

const plan = (overrides: Partial<RequirementInput> = {}): RequirementPlan =>
	requirementsForQuery(input(overrides));

const onlyRequirement = (overrides: Partial<RequirementInput> = {}): EngineRequirement => {
	const result = plan(overrides);
	expect(result.requirements).toHaveLength(1);
	return result.requirements[0] as EngineRequirement;
};

/** Selector dissection belongs here; lane-key encoding is pinned by sync-engine tests. */
describe('requirementsForQuery extraction', () => {
	it('returns no demand for unmapped and local-only collections', () => {
		expect(plan({ collectionName: 'nope', selector: undefined })).toEqual({
			requirements: [],
			represented: false,
		});
		expect(plan({ collectionName: 'taxes', selector: { search: 'GST' } })).toEqual({
			requirements: [],
			represented: false,
		});
		expect(plan({ collectionName: 'customers', limit: undefined })).toEqual({
			requirements: [],
			represented: false,
		});
	});

	it.each([
		['products/categories', 'categories'],
		['products/tags', 'tags'],
		['products/brands', 'brands'],
		['coupons', 'coupons'],
	] as const)('maps a %s browse to an on-demand %s refresh', (collectionName, collection) => {
		expect(plan({ collectionName, forceRefresh: true })).toEqual({
			requirements: [
				{
					id: 'q:reference-refresh',
					collection,
					kind: 'refresh',
					priority: 700,
				},
			],
			represented: false,
		});
	});

	it('carries an explicit reference priority without forcing the refresh', () => {
		expect(
			plan({
				collectionName: 'products/categories',
				priority: 725,
				forceRefresh: true,
			})
		).toEqual({
			requirements: [
				{
					id: 'q:reference-refresh',
					collection: 'categories',
					kind: 'refresh',
					priority: 725,
				},
			],
			represented: false,
		});
	});

	it('maps finite id selectors to targeted-records', () => {
		expect(onlyRequirement({ selector: { id: { $in: [1, '2', 'junk'] } } })).toEqual({
			id: 'q:targeted',
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [1, 2],
		});
		expect(
			onlyRequirement({
				collectionName: 'customers',
				selector: { id: { $eq: 7 } },
				limit: undefined,
			})
		).toMatchObject({ kind: 'targeted-records', wooIds: [7] });
		expect(
			onlyRequirement({
				collectionName: 'variations',
				selector: { id: '42' },
				limit: undefined,
			})
		).toMatchObject({ kind: 'targeted-records', wooIds: [42] });
		expect(plan({ collectionName: 'customers', selector: { id: { $in: [] } } })).toEqual({
			requirements: [],
			represented: false,
		});
	});

	it('does not search variations globally when finite ids already scope the query', () => {
		expect(
			plan({
				collectionName: 'variations',
				selector: { id: { $in: [11, 12] }, search: 'blue' },
				limit: 25,
			})
		).toEqual({
			requirements: [
				{
					id: 'q:targeted',
					collection: 'variations',
					kind: 'targeted-records',
					wooIds: [11, 12],
				},
			],
			represented: false,
		});
	});

	it.each([{ id: { $in: ['junk'] } }, { id: 'junk' }])(
		'emits a residual product superset for unusable ids',
		(selector) => {
			expect(plan({ selector })).toEqual({
				requirements: [
					{
						id: 'q:products-browse-window',
						collection: 'products',
						kind: 'product-browse',
						limit: 10,
					},
				],
				represented: false,
			});
		}
	);

	it('maps search terms for searchable collections only', () => {
		expect(
			plan({
				selector: { search: 'mug' },
				limit: 25,
				priority: 5,
				forceRefresh: true,
			})
		).toEqual({
			requirements: [
				{
					id: 'q:search',
					collection: 'products',
					kind: 'search',
					term: 'mug',
					limit: 25,
					priority: 5,
					forceRefresh: true,
				},
			],
			represented: false,
		});
		expect(
			plan({
				collectionName: 'customers',
				selector: { search: 'ada' },
				limit: 25,
			})
		).toEqual({
			requirements: [
				{
					id: 'q:search',
					collection: 'customers',
					kind: 'search',
					term: 'ada',
					limit: 25,
				},
			],
			represented: false,
		});
		expect(
			plan({
				collectionName: 'variations',
				selector: { search: 'blue' },
				limit: 25,
			})
		).toEqual({
			requirements: [
				{
					id: 'q:search',
					collection: 'variations',
					kind: 'search',
					term: 'blue',
					limit: 25,
				},
			],
			represented: false,
		});
		expect(plan({ collectionName: 'taxes', selector: { search: 'GST' } })).toEqual({
			requirements: [],
			represented: false,
		});
	});

	it('keeps short product SKU demand but suppresses short customer remote search', () => {
		expect(onlyRequirement({ selector: { search: '42' } })).toMatchObject({
			collection: 'products',
			kind: 'search',
			term: '42',
		});
		expect(
			onlyRequirement({ collectionName: 'variations', selector: { search: '42' } })
		).toMatchObject({
			collection: 'variations',
			kind: 'search',
			term: '42',
		});
		expect(plan({ collectionName: 'customers', selector: { search: '42' }, limit: 25 })).toEqual({
			requirements: [],
			represented: false,
		});
		expect(
			onlyRequirement({ collectionName: 'customers', selector: { search: 'ada' }, limit: 25 })
		).toMatchObject({ collection: 'customers', kind: 'search', term: 'ada' });
	});

	// #951. A cashier who sorts the customers grid expects to see THOSE customers, not the
	// locally-resident slice the idle trickle happened to reach, re-ordered.
	describe('customers browse window', () => {
		const customerPlan = (overrides: Partial<RequirementInput> = {}) =>
			plan({ collectionName: 'customers', selector: {}, ...overrides });
		const customerRequirement = (overrides: Partial<RequirementInput> = {}) =>
			onlyRequirement({ collectionName: 'customers', selector: {}, ...overrides });

		it('declares NO demand for an unsorted browse — customers stay on-demand (#865)', () => {
			expect(customerPlan({ sort: undefined })).toEqual({ requirements: [], represented: false });
		});

		it('sends a sort the wire can express to the server', () => {
			expect(customerRequirement({ sort: [{ date_created_gmt: 'desc' }], limit: 10 })).toEqual({
				id: 'q:customers-browse-window',
				collection: 'customers',
				kind: 'customer-browse',
				limit: 10,
				// 1.9 parity: hooks/customers.tsx mapped date_created → registered_date.
				orderby: 'registered_date',
				order: 'desc',
			});
			expect(customerRequirement({ sort: [{ id: 'asc' }] })).toMatchObject({
				kind: 'customer-browse',
				orderby: 'id',
				order: 'asc',
			});
		});

		// The v2 proxy forwards /customers to wc/v3, which rejects these with a 400. Requesting
		// one per scroll tick is strictly worse than a local sort that admits it is local.
		it.each(['last_name', 'first_name', 'email', 'role', 'username', 'date_modified_gmt'])(
			'never puts the plugin-only sort %s on the wire',
			(field) => {
				expect(customerPlan({ sort: [{ [field]: 'asc' }] })).toEqual({
					requirements: [],
					represented: false,
				});
			}
		);

		it('carries the grid limit so scroll extension advances the window', () => {
			const first = customerRequirement({ sort: [{ id: 'asc' }], limit: 10 });
			const extended = customerRequirement({ sort: [{ id: 'asc' }], limit: 110 });
			expect(first).toMatchObject({ limit: 10 });
			expect(extended).toMatchObject({ limit: 110 });
		});

		// #850/#865 regression guard. use-default-customer.ts passes `wooIds: []` for the guest
		// (id 0) so that NOTHING is fetched — its comment says "no fetch is ever declared". That
		// selector compiles to `id: { $in: [] }`, which finiteWooIds reports as null (no targeted
		// demand). Without this guard the browse branch then sees the hook's `id asc` sort and
		// pulls a 100-row customer window on every cold POS mount — an eager customer seed, which
		// is exactly what #865 rules out.
		it('declares NOTHING for an empty finite-ID customer lookup, even with a sortable field', () => {
			expect(
				plan({
					collectionName: 'customers',
					selector: { id: { $in: [] } },
					sort: [{ id: 'asc' }],
					limit: 1,
				})
			).toEqual({ requirements: [], represented: false });
		});

		it('still prefers search and targeted demand over the browse window', () => {
			expect(
				onlyRequirement({
					collectionName: 'customers',
					selector: { search: 'ada' },
					sort: [{ id: 'asc' }],
					limit: 25,
				})
			).toMatchObject({ kind: 'search' });
			expect(
				onlyRequirement({
					collectionName: 'customers',
					selector: { id: { $in: [7] } },
					sort: [{ id: 'asc' }],
				})
			).toMatchObject({ kind: 'targeted-records' });
		});
	});

	describe('orders browse dimensions', () => {
		const orderPlan = (overrides: Partial<RequirementInput> = {}) =>
			plan({ collectionName: 'orders', selector: {}, ...overrides });
		const orderRequirement = (overrides: Partial<RequirementInput> = {}) =>
			onlyRequirement({ collectionName: 'orders', selector: {}, ...overrides });

		it('extracts empty, bare-status and $eq-status browses', () => {
			expect(orderPlan({ selector: undefined, limit: undefined })).toEqual({
				requirements: [
					{
						id: 'q:orders-browse',
						collection: 'orders',
						kind: 'orders-browse',
					},
				],
				represented: true,
			});
			expect(
				orderRequirement({
					selector: { status: { $eq: 'processing' }, search: 'jane' },
					limit: 9999,
				})
			).toEqual({
				id: 'q:orders-browse',
				collection: 'orders',
				kind: 'orders-browse',
				status: 'processing',
				search: 'jane',
				limit: 9999,
			});
			expect(orderRequirement({ selector: { status: 'completed' } })).toMatchObject({
				status: 'completed',
			});
		});

		it.each([42, { $eq: 0 }])('extracts customer %p at interactive priority', (customer_id) => {
			expect(
				orderPlan({
					selector: { status: 'processing', customer_id },
					limit: 25,
				})
			).toEqual({
				requirements: [
					{
						id: 'q:orders-browse',
						collection: 'orders',
						kind: 'orders-browse',
						status: 'processing',
						customerId: typeof customer_id === 'number' ? customer_id : customer_id.$eq,
						limit: 25,
						priority: 700,
					},
				],
				represented: true,
			});
		});

		it('scans $and metadata for cashier and store', () => {
			expect(
				orderPlan({
					selector: {
						$and: [
							{ meta_data: { $elemMatch: { key: '_pos_user', value: '7' } } },
							{ meta_data: { $elemMatch: { key: '_pos_store', value: '12' } } },
						],
					},
					limit: 25,
				})
			).toEqual({
				requirements: [
					{
						id: 'q:orders-browse',
						collection: 'orders',
						kind: 'orders-browse',
						cashierId: 7,
						store: '12',
						limit: 25,
						priority: 700,
					},
				],
				represented: true,
			});
		});

		it.each([
			['_pos_user', 'cashierId'],
			['_pos_store', 'store'],
		] as const)('keeps non-numeric %s metadata residual', (key, dimension) => {
			const result = orderPlan({
				selector: {
					$and: [{ meta_data: { $elemMatch: { key, value: 'not-numeric' } } }],
				},
				limit: 25,
			});

			expect(result.represented).toBe(false);
			expect(result.requirements[0]).not.toHaveProperty(dimension);
		});

		it.each([
			{ created_via: 'woocommerce-pos' },
			{ created_via: { $eq: 'woocommerce-pos' } },
			{ $and: [{ created_via: 'woocommerce-pos' }] },
			{ $and: [{ created_via: { $eq: 'woocommerce-pos' } }] },
		])('extracts root and nested created_via slug %#', (selector) => {
			expect(orderPlan({ selector, limit: 25 })).toEqual({
				requirements: [
					{
						id: 'q:orders-browse',
						collection: 'orders',
						kind: 'orders-browse',
						store: 'woocommerce-pos',
						limit: 25,
						priority: 700,
					},
				],
				represented: true,
			});
		});

		// The WCPOS server plugin has supported its extended orderby values since 2023-10-27.
		it.each([
			['date_created_gmt', 'desc', 'date'],
			['sortable_number', 'desc', 'id'],
			['status', 'asc', 'status'],
			['customer_id', 'asc', 'customer_id'],
			['payment_method', 'asc', 'payment_method'],
			['total', 'asc', 'total'],
			['sortable_total', 'asc', 'total'],
		] as const)('maps order sort %s %s to %s', (field, order, orderby) => {
			expect(orderRequirement({ sort: [{ [field]: order }] })).toMatchObject({ orderby, order });
		});

		it('extracts reports ranges and reserves all-results for a representable bound', () => {
			expect(
				orderPlan({
					id: 'reports',
					selector: {
						status: { $eq: 'completed' },
						date_created_gmt: {
							$gte: '2026-07-01T00:00:00',
							$lte: '2026-07-14T23:59:59',
						},
					},
					limit: Number.MAX_SAFE_INTEGER,
				})
			).toEqual({
				requirements: [
					{
						id: 'reports:orders-browse',
						collection: 'orders',
						kind: 'orders-browse',
						status: 'completed',
						afterSeconds: 1782864000,
						beforeSeconds: 1784073599,
						limit: 'all',
						priority: 700,
					},
				],
				represented: true,
			});
			expect(
				orderRequirement({
					selector: { date_created_gmt: { $gte: 'nope' } },
					limit: Number.MAX_SAFE_INTEGER,
				})
			).toMatchObject({ limit: Number.MAX_SAFE_INTEGER });
			expect(
				orderPlan({
					selector: { date_created_gmt: { $gte: 'nope' } },
					limit: 25,
				}).represented
			).toBe(false);
		});

		it('keeps small and scrolled ranged limits raw', () => {
			expect(
				orderRequirement({
					selector: { date_created_gmt: { $gte: '2026-07-01T00:00:00' } },
					limit: 25,
				})
			).toMatchObject({ afterSeconds: 1782864000, limit: 25, priority: 700 });
			expect(
				orderRequirement({
					selector: { date_created_gmt: { $gte: '2026-07-01T00:00:00' } },
					limit: 210,
				})
			).toMatchObject({ afterSeconds: 1782864000, limit: 210, priority: 700 });
		});

		it('reads date-only bounds as UTC midnight', () => {
			expect(
				orderRequirement({
					selector: {
						date_created_gmt: { $gte: '2026-07-01', $lte: '2026-07-14' },
					},
					limit: Number.MAX_SAFE_INTEGER,
				})
			).toMatchObject({
				afterSeconds: 1782864000,
				beforeSeconds: 1783987200,
				limit: 'all',
			});
		});

		it.each(['invoice:after=123', 'note:customer=42'])(
			'keeps literal dimension text in search without scoping: %s',
			(search) => {
				expect(orderRequirement({ selector: { search }, limit: 25 })).toEqual({
					id: 'q:orders-browse',
					collection: 'orders',
					kind: 'orders-browse',
					search,
					limit: 25,
				});
			}
		);
	});

	describe('product browse dimensions', () => {
		it('extracts every supported filter and interactive priority', () => {
			expect(
				plan({
					selector: {
						$and: [
							{
								$or: [
									{ categories: { $elemMatch: { id: 7 } } },
									{ categories: { $elemMatch: { id: 2 } } },
									{ categories: { $elemMatch: { id: 7 } } },
								],
							},
							{ $or: [{ tags: { $elemMatch: { id: 3 } } }] },
							{ $or: [{ brands: { $elemMatch: { id: 5 } } }] },
							{ featured: true },
							{ on_sale: false },
							{ stock_status: { $eq: 'instock' } },
						],
					},
				})
			).toEqual({
				requirements: [
					{
						id: 'q:products-browse-window',
						collection: 'products',
						kind: 'product-browse',
						limit: 10,
						category: [2, 7],
						tag: [3],
						brand: [5],
						featured: true,
						on_sale: false,
						stock_status: 'instock',
						priority: 700,
					},
				],
				represented: true,
			});
		});

		it('emits representable dimensions and a false verdict for residual filters', () => {
			expect(
				plan({
					selector: {
						featured: false,
						$and: [
							{ stock_status: 'onbackorder' },
							{ status: 'publish' },
							{ attributes: { $allMatch: [{ id: 1, option: 'Large' }] } },
							{ uuid: 'local-only' },
						],
					},
					limit: 110,
					sort: [{ sortable_price: 'desc' }],
				})
			).toEqual({
				requirements: [
					{
						id: 'q:products-browse-window',
						collection: 'products',
						kind: 'product-browse',
						limit: 110,
						orderby: 'price',
						order: 'desc',
						featured: false,
						stock_status: 'onbackorder',
						priority: 700,
					},
				],
				represented: false,
			});
		});

		it.each([10, 90, 110, 210, 99_999])('passes raw grid limit %i to the engine', (limit) => {
			expect(onlyRequirement({ limit })).toEqual({
				id: 'q:products-browse-window',
				collection: 'products',
				kind: 'product-browse',
				limit,
			});
		});

		it.each([
			['sortable_price', 'desc', 'price'],
			['name', 'asc', 'title'],
			['date_modified_gmt', 'desc', 'modified'],
			['total_sales', 'desc', 'popularity'],
			['menu_order', 'asc', 'menu_order'],
			// The WCPOS server plugin has supported these values since 2023-10-27.
			['sku', 'asc', 'sku'],
			['barcode', 'asc', 'barcode'],
			['stock_quantity', 'asc', 'stock_quantity'],
			['stock_status', 'asc', 'stock_status'],
		] as const)('maps product sort %s %s to %s', (field, order, orderby) => {
			expect(onlyRequirement({ limit: 100, sort: [{ [field]: order }] })).toMatchObject({
				limit: 100,
				orderby,
				order,
			});
		});

		it('reports represented only when every product predicate reaches the wire', () => {
			expect(plan({ selector: undefined }).represented).toBe(true);
			expect(plan({ selector: {} }).represented).toBe(true);
			expect(plan({ selector: { status: 'publish', stock_status: 'instock' } }).represented).toBe(
				true
			);
			expect(plan({ selector: { status: { $eq: 'publish' } } }).represented).toBe(true);
			expect(plan({ selector: { status: 'draft' } }).represented).toBe(false);
			expect(
				plan({
					selector: {
						$or: [{ categories: { $elemMatch: { id: 7 } } }, { name: 'Hat' }],
					},
				}).represented
			).toBe(false);
			expect(
				plan({
					selector: {
						$or: [{ categories: { $elemMatch: { id: 7, name: 'Hats' } } }],
					},
				}).represented
			).toBe(false);
			expect(plan({ selector: { stock_status: 'sold' } }).represented).toBe(false);
		});
	});
});

describe('declareRequirements', () => {
	let database: RxDatabase;

	beforeEach(async () => {
		database = await createEngineDatabase();
	});

	afterEach(async () => {
		await database.close();
	});

	it('declares requirement objects and swallows search rejections', async () => {
		const engine = createFakeEngine(database);
		engine.searchFailure = new Error('offline');
		const requirements: EngineRequirement[] = [
			{ id: 'a', collection: 'products', kind: 'search', term: 'mug' },
			{
				id: 'b',
				collection: 'products',
				kind: 'targeted-records',
				wooIds: [1],
			},
		];
		const handles = declareRequirements(engine as never, requirements);
		expect(handles).toHaveLength(2);
		expect(engine.requireCalls).toEqual(requirements);
		await expect(handles[1].ready).resolves.toMatchObject({
			action: 'serve-local',
		});
	});
});
