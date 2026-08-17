import type { EngineRequirement, RequirementHandle } from '@wcpos/sync-engine';

import { declareRequirements, requirementsForQuery } from '../src/requirement-bridge';
import { createEngineDatabase, orderBrowserQueryKey } from '../src/testing';

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
			remoteIds: ['1', '2'],
		});
		expect(
			onlyRequirement({
				collectionName: 'customers',
				selector: { id: { $eq: 7 } },
				limit: undefined,
			})
		).toMatchObject({ kind: 'targeted-records', remoteIds: ['7'] });
		expect(
			onlyRequirement({
				collectionName: 'variations',
				selector: { id: '42' },
				limit: undefined,
			})
		).toMatchObject({ kind: 'targeted-records', remoteIds: ['42'] });
		expect(plan({ collectionName: 'customers', selector: { id: { $in: [] } } })).toEqual({
			requirements: [],
			represented: false,
		});
	});

	it('maps a bare numeric id selector to targeted-records demand', () => {
		expect(onlyRequirement({ selector: { id: 123 } })).toEqual({
			id: 'q:targeted',
			collection: 'products',
			kind: 'targeted-records',
			remoteIds: ['123'],
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
					remoteIds: ['11', '12'],
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

		// #1028 follow-on: the WCPOS plugin proxy (#1488) now re-applies these five customer
		// sorts through the V1 handler — role by staff hierarchy (#1500) — so the grid drives a
		// SERVER-sorted window instead of a local-only sort. Each maps 1:1 to its wire orderby.
		it.each(['last_name', 'first_name', 'email', 'role', 'username'] as const)(
			'sends the now-proxied customer sort %s to the server',
			(field) => {
				expect(customerRequirement({ sort: [{ [field]: 'asc' }], limit: 10 })).toEqual({
					id: 'q:customers-browse-window',
					collection: 'customers',
					kind: 'customer-browse',
					limit: 10,
					orderby: field,
					order: 'asc',
				});
			}
		);

		// date_modified_gmt has no customers orderby on any surface, so it stays local-only.
		it('keeps a sort with no wire orderby local (date_modified_gmt)', () => {
			expect(customerPlan({ sort: [{ date_modified_gmt: 'asc' }] })).toEqual({
				requirements: [],
				represented: false,
			});
		});

		it('carries the grid limit so scroll extension advances the window', () => {
			const first = customerRequirement({ sort: [{ id: 'asc' }], limit: 10 });
			const extended = customerRequirement({ sort: [{ id: 'asc' }], limit: 110 });
			expect(first).toMatchObject({ limit: 10 });
			expect(extended).toMatchObject({ limit: 110 });
		});

		// #850/#865 regression guard. use-default-customer.ts passes an empty id list for the guest
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

		it('keeps unrelated metadata residual without creating cashier or store demand', () => {
			const result = orderPlan({
				selector: {
					$and: [{ meta_data: { $elemMatch: { key: '_unrelated_plugin_key', value: '7' } } }],
				},
				limit: 25,
			});

			expect(result.represented).toBe(false);
			expect(result.requirements).toHaveLength(1);
			expect(result.requirements[0]).not.toHaveProperty('cashierId');
			expect(result.requirements[0]).not.toHaveProperty('store');
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

		// A ranged report downloads the WHOLE range and walks `date desc` on the wire whatever
		// the grid is sorted by, so re-sorting must NOT fork the lane — it used to, and every
		// re-sort re-downloaded the entire range.
		it('resolves every sort of one reports range to a single lane key', () => {
			const rangedSelector = {
				status: { $eq: 'completed' },
				date_created_gmt: { $gte: '2026-07-01T00:00:00', $lte: '2026-07-14T23:59:59' },
			};
			const keyFor = (sort: Record<string, 'asc' | 'desc'>[]) =>
				orderBrowserQueryKey(
					orderRequirement({
						selector: rangedSelector,
						sort,
						limit: Number.MAX_SAFE_INTEGER,
					}) as never
				);

			const byDate = keyFor([{ date_created_gmt: 'desc' }]);
			expect(byDate).toBe(
				'orders:browser:status=completed:after=1782864000:before=1784073599:search=:limit=all'
			);
			expect(keyFor([{ total: 'asc' }])).toBe(byDate);
			expect(keyFor([{ number: 'desc' }])).toBe(byDate);
		});

		// #909 sort-aware windows: a windowed browse's sort decides WHICH records it holds, so
		// it must keep forking per sort. Only the ranged family is sort-agnostic.
		it('still forks a windowed browse lane per sort', () => {
			const keyFor = (sort: Record<string, 'asc' | 'desc'>[]) =>
				orderBrowserQueryKey(orderRequirement({ sort, limit: 25 }) as never);

			expect(keyFor([{ total: 'asc' }])).not.toBe(keyFor([{ total: 'desc' }]));
			expect(keyFor([{ total: 'asc' }])).toContain(':orderby=total:order=asc');
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

		it('keeps a mixed-field taxonomy OR residual instead of narrowing remote demand', () => {
			expect(
				plan({
					selector: {
						$or: [{ categories: { $elemMatch: { id: 7 } } }, { tags: { $elemMatch: { id: 9 } } }],
					},
				})
			).toEqual({
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
		const searchHandle: RequirementHandle = {
			ready: Promise.reject(new Error('offline')),
			release: jest.fn(),
			queryKey: null,
		};
		const targetedHandle: RequirementHandle = {
			ready: Promise.resolve({
				action: 'serve-local',
				missingRecordIds: [],
				reason: 'stub',
			}),
			release: jest.fn(),
			queryKey: null,
		};
		const engine = {
			require: jest.fn((requirement: EngineRequirement) =>
				requirement.kind === 'search' ? searchHandle : targetedHandle
			),
		};
		const requirements: EngineRequirement[] = [
			{ id: 'a', collection: 'products', kind: 'search', term: 'mug' },
			{
				id: 'b',
				collection: 'products',
				kind: 'targeted-records',
				remoteIds: ['1'],
			},
		];
		const unhandled = jest.fn();
		process.once('unhandledRejection', unhandled);
		try {
			const handles = declareRequirements(engine as never, requirements);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(handles).toHaveLength(2);
			expect(handles).toEqual([searchHandle, targetedHandle]);
			expect(engine.require.mock.calls.map(([requirement]) => requirement)).toEqual(requirements);
			expect(unhandled).not.toHaveBeenCalled();
			await expect(handles[1].ready).resolves.toMatchObject({
				action: 'serve-local',
			});
		} finally {
			// A failing assertion above must not leak the listener into later tests.
			process.removeListener('unhandledRejection', unhandled);
		}
	});

	it('contains a rejected category refresh without an unhandled rejection', async () => {
		const handle: RequirementHandle = {
			ready: Promise.reject(new Error('offline')),
			release: jest.fn(),
			queryKey: null,
		};
		const engine = { require: jest.fn(() => handle) };
		const unhandled = jest.fn();
		process.once('unhandledRejection', unhandled);
		try {
			declareRequirements(engine as never, [
				{ id: 'category-filter', collection: 'categories', kind: 'refresh' },
			]);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.removeListener('unhandledRejection', unhandled);
		}
	});
});
