import {
	declareRequirements,
	prepareCollectionResetRefill,
	registerActiveBinding,
	requirementsForQuery,
} from '../src/requirement-bridge';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';

import type { RxDatabase } from 'rxdb';

/**
 * The requirement bridge translates legacy Mango params into the engine's
 * three demand shapes (targeted-records / search / order query) — ADR 0027.
 * These tests pin the translation rules the POS relies on.
 */
describe('requirementsForQuery', () => {
	it('returns no demand for unmapped collections', () => {
		expect(
			requirementsForQuery({ id: 'q', collectionName: 'nope', selector: undefined, limit: 10 })
		).toEqual([]);
	});

	it('maps finite id selectors to targeted-records', () => {
		const inSelector = requirementsForQuery({
			id: 'q',
			collectionName: 'products',
			selector: { id: { $in: [1, '2', 'junk'] } },
			limit: 10,
		});
		expect(inSelector).toEqual([
			{ id: 'q:targeted', collection: 'products', kind: 'targeted-records', wooIds: [1, 2] },
		]);

		const eqSelector = requirementsForQuery({
			id: 'q',
			collectionName: 'customers',
			selector: { id: { $eq: 7 } },
			limit: undefined,
		});
		expect(eqSelector[0]).toMatchObject({ kind: 'targeted-records', wooIds: [7] });

		const bareId = requirementsForQuery({
			id: 'q',
			collectionName: 'variations',
			selector: { id: '42' },
			limit: undefined,
		});
		expect(bareId[0]).toMatchObject({ wooIds: [42] });
	});

	it('drops unusable id selectors instead of guessing', () => {
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: { id: { $in: ['junk'] } },
				limit: 10,
			})
		).toEqual([]);
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: { id: 'junk' },
				limit: 10,
			})
		).toEqual([]);
	});

	it('maps search terms for searchable collections only', () => {
		const products = requirementsForQuery({
			id: 'q',
			collectionName: 'products',
			selector: { search: 'mug' },
			limit: 25,
			priority: 5,
			forceRefresh: true,
		});
		expect(products).toEqual([
			{
				id: 'q:search',
				collection: 'products',
				kind: 'search',
				term: 'mug',
				limit: 25,
				priority: 5,
				forceRefresh: true,
			},
		]);

		// taxes are not a search collection — a search term creates no remote demand
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'taxes',
				selector: { search: 'GST' },
				limit: 10,
			})
		).toEqual([]);
	});

	it('maps unbounded orders browse to a bounded query descriptor', () => {
		const plain = requirementsForQuery({
			id: 'q',
			collectionName: 'orders',
			selector: undefined,
			limit: undefined,
		});
		expect(plain).toEqual([
			{
				id: 'q:orders-query',
				collection: 'orders',
				kind: 'query',
				queryKey: 'orders:browser:status=all:search=:limit=10',
			},
		]);

		const filtered = requirementsForQuery({
			id: 'q',
			collectionName: 'orders',
			selector: { status: { $eq: 'processing' }, search: 'jane' },
			limit: 9999,
		});
		// status comes from $eq, the limit is capped at the browse-lane max (200)
		expect(filtered[0]).toMatchObject({
			queryKey: 'orders:browser:status=processing:search=jane:limit=200',
		});
	});

	it('maps customer order filters to interactive windowed descriptors', () => {
		for (const customer_id of [42, { $eq: 0 }]) {
			expect(
				requirementsForQuery({
					id: 'customer-orders',
					collectionName: 'orders',
					selector: { status: 'processing', customer_id },
					limit: 25,
				})
			).toEqual([
				{
					id: 'customer-orders:orders-query',
					collection: 'orders',
					kind: 'query',
					queryKey: `orders:browser:status=processing:customer=${
						typeof customer_id === 'number' ? customer_id : customer_id.$eq
					}:search=:limit=25`,
					priority: 700,
				},
			]);
		}
	});

	it('maps cashier and store metadata filters to interactive order dimensions', () => {
		expect(
			requirementsForQuery({
				id: 'orders',
				collectionName: 'orders',
				selector: {
					$and: [
						{ meta_data: { $elemMatch: { key: '_pos_user', value: '7' } } },
						{ meta_data: { $elemMatch: { key: '_pos_store', value: '12' } } },
					],
				},
				limit: 25,
			})
		).toEqual([
			{
				id: 'orders:orders-query',
				collection: 'orders',
				kind: 'query',
				queryKey: 'orders:browser:status=all:cashier=7:store=12:search=:limit=25',
				priority: 700,
			},
		]);
	});

	// The translator only promotes status/customer_id/dateRange to the selector root, so a
	// slug store arrives as an `$and` condition — both shapes must reach the wire.
	it('maps root and nested created_via selectors to the store dimension', () => {
		const selectors: Record<string, unknown>[] = [
			{ created_via: 'woocommerce-pos' },
			{ created_via: { $eq: 'woocommerce-pos' } },
			{ $and: [{ created_via: 'woocommerce-pos' }] },
			{ $and: [{ created_via: { $eq: 'woocommerce-pos' } }] },
		];
		for (const selector of selectors) {
			expect(
				requirementsForQuery({ id: 'orders', collectionName: 'orders', selector, limit: 25 })[0]
			).toMatchObject({
				queryKey: 'orders:browser:status=all:store=woocommerce-pos:search=:limit=25',
				priority: 700,
			});
		}
	});

	it('carries only mapped non-default order sorts', () => {
		const keyFor = (sort: Record<string, 'asc' | 'desc'>[]) =>
			requirementsForQuery({
				id: 'orders',
				collectionName: 'orders',
				selector: {},
				limit: 25,
				sort,
			})[0];
		expect(keyFor([{ date_created_gmt: 'desc' }])).toEqual({
			id: 'orders:orders-query',
			collection: 'orders',
			kind: 'query',
			queryKey: 'orders:browser:status=all:orderby=date:order=desc:search=:limit=25',
		});
		expect(keyFor([{ total: 'asc' }])?.queryKey).toBe(
			'orders:browser:status=all:search=:limit=25'
		);
		expect(keyFor([{ number: 'desc' }])?.queryKey).toBe(
			'orders:browser:status=all:search=:limit=25'
		);
	});

	it('maps reports date ranges to ranged complete order descriptors', () => {
		expect(
			requirementsForQuery({
				id: 'reports',
				collectionName: 'orders',
				selector: {
					status: { $eq: 'completed' },
					date_created_gmt: {
						$gte: '2026-07-01T00:00:00',
						$lte: '2026-07-14T23:59:59',
					},
				},
				limit: Number.MAX_SAFE_INTEGER,
			})
		).toEqual([
			{
				id: 'reports:orders-query',
				collection: 'orders',
				kind: 'query',
				queryKey:
					'orders:browser:status=completed:after=1782864000:before=1784073599:search=:limit=all',
				priority: 700,
			},
		]);
	});

	it('keeps ranged order descriptors bounded for small limits', () => {
		const [requirement] = requirementsForQuery({
			id: 'reports',
			collectionName: 'orders',
			selector: { date_created_gmt: { $gte: '2026-07-01T00:00:00' } },
			limit: 25,
		});
		expect(requirement).toMatchObject({
			queryKey: 'orders:browser:status=all:after=1782864000:search=:limit=25',
			priority: 700,
		});
	});

	// `2026-07-01Z` is not a Date Time String Format production; leaving date-only values
	// untouched keeps the bound identical across V8, Hermes and JSC.
	it('reads date-only range bounds as UTC midnight', () => {
		const [requirement] = requirementsForQuery({
			id: 'reports',
			collectionName: 'orders',
			selector: { date_created_gmt: { $gte: '2026-07-01', $lte: '2026-07-14' } },
			limit: Number.MAX_SAFE_INTEGER,
		});
		// 2026-07-01T00:00:00Z and 2026-07-14T00:00:00Z — UTC midnight, not local midnight.
		expect(requirement).toMatchObject({
			queryKey: 'orders:browser:status=all:after=1782864000:before=1783987200:search=:limit=all',
		});
	});

	// Fetch-to-completion is reserved for the all-results sentinel Reports passes. An
	// ordinary ranged grid that scrolls past the browse cap (limit 210) must stay windowed.
	it('does not promote a scrolled ranged browse to fetch-to-completion', () => {
		const [requirement] = requirementsForQuery({
			id: 'orders',
			collectionName: 'orders',
			selector: { date_created_gmt: { $gte: '2026-07-01T00:00:00' } },
			limit: 210,
		});
		expect(requirement).toMatchObject({
			queryKey: 'orders:browser:status=all:after=1782864000:search=:limit=200',
			// Priority and completion are independent axes: a cashier-applied dimension is
			// interactive demand (700) whether or not it is allowed to run to completion.
			// Only `:limit=all` — the sentinel Reports passes — authorises completion.
			priority: 700,
		});
		expect(requirement.queryKey).not.toContain(':limit=all');
	});

	// A cashier search containing literal range tokens must round-trip as search text.
	it('keeps literal range tokens in the search component of the descriptor', () => {
		const [requirement] = requirementsForQuery({
			id: 'orders',
			collectionName: 'orders',
			selector: { search: 'invoice:after=123' },
			limit: 25,
		});
		expect(requirement).toMatchObject({
			queryKey: 'orders:browser:status=all:search=invoice:after=123:limit=25',
		});
	});

	// Priority comes from the computed dimensions, never from sniffing the key text —
	// otherwise a cashier searching for `note:customer=42` would promote an unfiltered
	// browse to the interactive band.
	it('does not promote an unfiltered browse whose search text looks like a dimension', () => {
		const [requirement] = requirementsForQuery({
			id: 'orders',
			collectionName: 'orders',
			selector: { search: 'note:customer=42' },
			limit: 25,
		});
		expect(requirement).toEqual({
			id: 'orders:orders-query',
			collection: 'orders',
			kind: 'query',
			queryKey: 'orders:browser:status=all:search=note:customer=42:limit=25',
		});
		expect(requirement).not.toHaveProperty('priority');
	});

	it('creates no demand for a FILTERED products browse', () => {
		// Filters still ride local residents only (ADR 0027) — only the UNFILTERED
		// browse gets a window.
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: { stock_status: 'instock' },
				limit: 10,
			})
		).toEqual([]);
	});

	// #909 — the browse window carries the grid's own limit …
	it('maps an unfiltered products browse to a browse-window descriptor', () => {
		expect(
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: {},
				limit: 10,
			})
		).toEqual([
			{
				id: 'q:products-browse-window',
				collection: 'products',
				kind: 'query',
				queryKey: 'products:browse-window:limit=100',
			},
		]);
	});

	it('grows the window key as the grid scrolls, quantized to the window step', () => {
		const keyFor = (limit: number) =>
			requirementsForQuery({ id: 'q', collectionName: 'products', selector: {}, limit })[0]
				?.queryKey;
		// A 10-row scroll tick must NOT mint a new coverage lane every time…
		expect(keyFor(10)).toBe('products:browse-window:limit=100');
		expect(keyFor(90)).toBe('products:browse-window:limit=100');
		// …but crossing the window edge must, or scrolling fetches nothing (the #909 bug).
		expect(keyFor(110)).toBe('products:browse-window:limit=200');
		expect(keyFor(210)).toBe('products:browse-window:limit=300');
		// Browse is a seed, not a query engine: the window is capped.
		expect(keyFor(99_999)).toBe('products:browse-window:limit=1000');
	});

	// … and the grid's own sort (Paul's ruling: sort-aware seed).
	it('carries a Woo-expressible sort into the browse-window key', () => {
		const keyFor = (sort: Record<string, 'asc' | 'desc'>[]) =>
			requirementsForQuery({
				id: 'q',
				collectionName: 'products',
				selector: {},
				limit: 100,
				sort,
			})[0]?.queryKey;
		expect(keyFor([{ sortable_price: 'desc' }])).toBe(
			'products:browse-window:limit=100:orderby=price:order=desc'
		);
		expect(keyFor([{ name: 'asc' }])).toBe(
			'products:browse-window:limit=100:orderby=title:order=asc'
		);
		expect(keyFor([{ date_modified_gmt: 'desc' }])).toBe(
			'products:browse-window:limit=100:orderby=modified:order=desc'
		);
		expect(keyFor([{ total_sales: 'desc' }])).toBe(
			'products:browse-window:limit=100:orderby=popularity:order=desc'
		);
		// The POS catalog default keeps the bare key — one identity for the cold seed.
		expect(keyFor([{ menu_order: 'asc' }, { id: 'asc' }])).toBe('products:browse-window:limit=100');
		// Sorts Woo REST cannot express fall back to the default window rather than
		// pretending a server-sorted slice exists.
		expect(keyFor([{ sku: 'asc' }])).toBe('products:browse-window:limit=100');
		expect(keyFor([{ stock_quantity: 'desc' }])).toBe('products:browse-window:limit=100');
	});

	it('creates no demand for unbounded customer browse', () => {
		expect(
			requirementsForQuery({
				id: 'customers',
				collectionName: 'customers',
				selector: {},
				limit: undefined,
			})
		).toEqual([]);
	});

	it('maps a bounded customer search to exactly one search requirement', () => {
		expect(
			requirementsForQuery({
				id: 'customers',
				collectionName: 'customers',
				selector: { search: 'ada' },
				limit: 25,
			})
		).toEqual([
			{
				id: 'customers:search',
				collection: 'customers',
				kind: 'search',
				term: 'ada',
				limit: 25,
			},
		]);
	});

	it('creates no demand for the empty customer id list', () => {
		expect(
			requirementsForQuery({
				id: 'customers',
				collectionName: 'customers',
				selector: { id: { $in: [] } },
				limit: 10,
			})
		).toEqual([]);
	});
});

describe('declareRequirements / registerActiveBinding / reset refill', () => {
	let database: RxDatabase;

	beforeEach(async () => {
		database = await createEngineDatabase();
	});

	afterEach(async () => {
		await database.close();
	});

	it('declares requirements and swallows search rejections', async () => {
		const engine = createFakeEngine(database);
		engine.searchFailure = new Error('offline');
		const handles = declareRequirements(engine as never, [
			{ id: 'a', collection: 'products', kind: 'search', term: 'mug' },
			{ id: 'b', collection: 'products', kind: 'targeted-records', wooIds: [1] },
		]);
		expect(handles).toHaveLength(2);
		expect(engine.requireCalls.map((r) => r.kind)).toEqual(['search', 'targeted-records']);
		// the rejected search handle must not produce an unhandled rejection
		await expect(handles[1].ready).resolves.toMatchObject({ action: 'serve-local' });
	});

	it('re-declares registered bindings (force-refreshed) after a reset', async () => {
		const engine = createFakeEngine(database);
		const unregister = registerActiveBinding(engine as never, {
			id: 'grid',
			collectionName: 'products',
			selector: { id: { $in: [1, 2] } },
			limit: 10,
		});

		const refill = prepareCollectionResetRefill(engine as never, ['products']);
		await refill();

		const targeted = engine.requireCalls.find((r) => r.kind === 'targeted-records');
		expect(targeted).toMatchObject({
			id: 'grid:collection-reset:targeted',
			collection: 'products',
			forceRefresh: true,
			priority: 1000,
			wooIds: [1, 2],
		});

		// once unregistered, a later reset re-declares nothing for the binding
		unregister();
		const engine2 = createFakeEngine(database);
		await prepareCollectionResetRefill(engine2 as never, ['products'])();
		expect(engine2.requireCalls.filter((r) => r.kind === 'targeted-records')).toEqual([]);
	});

	it('synthesizes the taxRates refresh on a taxes reset', async () => {
		const engine = createFakeEngine(database);
		await prepareCollectionResetRefill(engine as never, ['taxes'])();
		expect(engine.requireCalls).toEqual([
			{
				id: 'taxRates:collection-reset',
				collection: 'taxRates',
				kind: 'refresh',
				forceRefresh: true,
				priority: 1000,
			},
		]);
	});
});
