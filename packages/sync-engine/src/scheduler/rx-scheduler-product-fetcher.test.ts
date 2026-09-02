// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	type ProductDocument,
	type RemoteId,
	type StoredProductDocument,
	wooIdOf,
} from '@wcpos/sync-core';

import { remoteId } from '../testing';
import { hydrateResponse } from '../transport/response-envelope';
import {
	coverageRecordId,
	createProductsSchedulerFetcher,
	PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES,
} from './rx-scheduler-product-fetcher';

import type { FetchTask } from './replication-policy';

function productTask(overrides: Partial<FetchTask> = {}): FetchTask {
	return {
		id: 'products:search:keyboard:windowed',
		requirementId: 'products.search.keyboard',
		collection: 'products',
		queryKey: 'products:search:keyboard',
		limit: 25,
		priority: 900,
		mode: 'windowed',
		...overrides,
	};
}

function response(payload: unknown[], totalPages?: number, totalRecords?: string): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			...(totalPages === undefined ? {} : { 'x-wp-totalpages': String(totalPages) }),
			...(totalRecords === undefined ? {} : { 'x-wp-total': totalRecords }),
		},
	});
}

// Server-stamped identity: a deterministic v4-shaped uuid per Woo id, so the post-flip
// STORAGE key (document.id) is predictable. The numeric wooId survives as `wooProductId`
// and as the `woo-product:<id>` COVERAGE key (decoupled from storage — see #234).
const uuidFor = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const posMeta = (n: number) => [{ key: '_woocommerce_pos_uuid', value: uuidFor(n) }];

describe('createProductsSchedulerFetcher', () => {
	it.each(['header-only', 'body-only', 'both'] as const)(
		'produces the same browse outcome from a %s response',
		async (mode) => {
			const payload = {
				id: 321,
				name: 'Envelope product',
				status: 'publish',
				date_modified_gmt: '2026-05-20T10:10:00',
				meta_data: posMeta(321),
			};
			const body =
				mode === 'header-only'
					? [payload]
					: { data: [payload], _wcpos: { v: 1, total: 1, total_pages: 1 } };
			const headers: Record<string, string> =
				mode === 'body-only'
					? { 'content-type': 'application/json' }
					: {
							'content-type': 'application/json',
							'X-WP-Total': '1',
							'X-WP-TotalPages': '1',
						};
			const fetcher = vi.fn(async () =>
				hydrateResponse(new Response(JSON.stringify(body), { headers }), {
					envelopeRequested: true,
				})
			);
			const cacheQueryTotals = vi.fn(async () => undefined);
			const schedulerFetcher = createProductsSchedulerFetcher({
				baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
				repository: {
					upsertMany: vi.fn(async () => undefined),
					removeMany: vi.fn(async () => undefined),
				},
				fetcher,
				cacheQueryTotals,
			});

			const result = await schedulerFetcher(
				productTask({
					id: 'products:browse-window:limit=100:windowed',
					queryKey: 'products:browse-window:limit=100',
					limit: 100,
				})
			);

			expect(result).toMatchObject({
				documentCount: 1,
				requestCount: 1,
				completed: true,
			});
			expect(cacheQueryTotals).toHaveBeenCalledWith({
				// Window total only — census:products is probe-owned (#1400).
				queryKeys: ['products:browse-window:limit=100'],
				totalMatchingRecords: 1,
			});
		}
	);

	it("re-reads the barcode carriers per request, never freezing the drain's first read", async () => {
		// A drain spans many requests and the change-signal lane publishes carriers
		// concurrently. Holding the first read would let the tail of a slow drain
		// write rows by a carrier the site has already stopped using — and the
		// config fingerprint has already moved, so nothing would repair them.
		const upserted: { payload: { barcode?: string } }[][] = [];
		const repository = {
			upsertMany: vi.fn(async (documents: unknown[]) => {
				upserted.push(documents as { payload: { barcode?: string } }[]);
			}),
			removeMany: vi.fn(async () => undefined),
		};
		let carrier = 'sku';
		let requests = 0;
		const fetcher = vi.fn(async (url: string) => {
			// The site flips its barcode carrier once this drain is already underway,
			// i.e. after the first batch was materialized and persisted.
			if (requests > 0) carrier = 'global_unique_id';
			requests += 1;
			const wooId = Number(new URL(url).searchParams.get('include'));
			const payload = {
				id: wooId,
				name: `Product ${wooId}`,
				status: 'publish',
				date_modified_gmt: '2026-05-20T10:10:00',
				sku: `SKU-${wooId}`,
				global_unique_id: `GTIN-${wooId}`,
				meta_data: posMeta(wooId),
			};
			return response([payload]);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 1,
			barcodeSelectors: () => ({ products: [carrier], variations: [carrier] }),
		});

		await schedulerFetcher(
			productTask({
				id: 'products:ids:321,654:on-demand',
				requirementId: 'products.cart-items',
				queryKey: 'products:ids:321,654',
				documentIds: ['woo-product:321', 'woo-product:654'],
				remoteIds: [321, 654].map(remoteId),
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
		const barcodeOf = (batch: number) => upserted[batch][0].payload.barcode;
		// First batch: read before the flip. Second: read after it.
		expect(barcodeOf(0)).toBe('SKU-321');
		expect(barcodeOf(1)).toBe('GTIN-654');
	});

	it('runs both legs for a two-character search', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async (_url: string) => response([]));
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:search:42:windowed',
				queryKey: 'products:search:42',
			})
		);

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wcpos/v2/products?sku=42&per_page=25&page=1&orderby=id&order=desc&status=publish',
			'http://wcpos.local/wp-json/wcpos/v2/products?search=42&per_page=25&page=1&orderby=id&order=desc&status=publish',
		]);
		expect(result).toMatchObject({ requestCount: 2, completed: true });
	});

	it('uses only search= when the exact SKU leg is disabled', async () => {
		const fetcher = vi.fn(async (_url: string) => response([]));
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository: {
				upsertMany: vi.fn(async () => undefined),
				removeMany: vi.fn(async () => undefined),
			},
			fetcher,
			exactSkuLeg: () => false,
		});

		const result = await schedulerFetcher(productTask());

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wcpos/v2/products?search=keyboard&per_page=25&page=1&orderby=id&order=desc&status=publish',
		]);
		expect(result.requestCount).toBe(1);
	});

	it.each([
		['disabled', false],
		['required', true],
	] as const)(
		'makes no request for whitespace when the exact SKU leg is %s',
		async (_label, required) => {
			const fetcher = vi.fn(async () => response([]));
			const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
			const schedulerFetcher = createProductsSchedulerFetcher({
				baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
				repository: {
					upsertMany: vi.fn(async () => undefined),
					removeMany: vi.fn(async () => undefined),
				},
				fetcher,
				coverageRepository,
				coverageFreshForMs: 60_000,
				nowMs: () => 5_000,
				exactSkuLeg: () => required,
			});

			const result = await schedulerFetcher(
				productTask({ id: 'products:search:%20%20:windowed', queryKey: 'products:search:%20%20' })
			);

			expect(fetcher).not.toHaveBeenCalled();
			expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
				collection: 'products',
				queryKey: 'products:search:%20%20',
				records: [],
				complete: true,
				nowMs: 5_000,
				freshForMs: 60_000,
			});
			expect(result).toMatchObject({ documentCount: 0, requestCount: 0, completed: true });
		}
	);

	it('walks each product search leg in Performance-dial pages, not one task-limit request', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 321,
					name: 'Keyboard',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(321),
				},
			])
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 10,
		});

		const result = await schedulerFetcher(productTask());

		// #908: per_page follows the dial (10), NOT the task limit (25). The short page
		// exhausts each leg, so it is still two requests.
		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/products?sku=keyboard&per_page=10&page=1&orderby=id&order=desc&status=publish'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/products?search=keyboard&per_page=10&page=1&orderby=id&order=desc&status=publish'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			{
				uuid: uuidFor(321),
				remoteId: remoteId(321),
				// Promoted filter/sort columns attached at the storage seam (withProductColumns). This payload
				// carries no filter fields, so they default — proving the promotion runs on every upsert.
				price: 0,
				stockStatus: '',
				type: '',
				categoryIds: [],
				brandIds: [],
				onSale: false,
				featured: false,
				stockQuantity: null,
				payload: {
					id: 321,
					name: 'Keyboard',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(321),
				},
				sync: {
					revision: '2026-05-20T10:10:00',
					partial: false,
					source: 'woo-rest',
				},
				local: { dirty: false, pendingMutationIds: [] },
			},
		]);
		expect(result).toEqual({
			taskId: 'products:search:keyboard:windowed',
			documentCount: 1,
			requestCount: 2,
			completed: true,
		});
	});

	it('sends multiple tag ids as one comma-delimited Woo REST parameter', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
		});

		await schedulerFetcher(
			productTask({
				id: 'products:browse-window:limit=100:tag=3,9:windowed',
				queryKey: 'products:browse-window:limit=100:tag=3,9',
				limit: 100,
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/products?per_page=100&orderby=menu_order&order=asc&status=publish&tag=3%2C9&page=1'
		);
	});

	it('keeps a constant per_page across search pages when the limit is not dial-divisible', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		// 30+ matches on the search leg; the sku leg is empty. Woo's offset is
		// (page-1)*per_page, so shrinking the final page to the 5 remaining rows
		// would re-read rows 11-15 and drop the true tail (greptile/codex P1).
		const wooProduct = (id: number) => ({
			id,
			name: `Widget ${id}`,
			date_modified_gmt: '2026-05-20T10:10:00',
			meta_data: posMeta(id),
		});
		const fetcher = vi.fn(async (url: string) => {
			if (url.includes('sku=')) return response([]);
			const params = new URL(url).searchParams;
			const perPage = Number(params.get('per_page'));
			const page = Number(params.get('page'));
			const first = 1000 - (page - 1) * perPage;
			return response(Array.from({ length: perPage }, (_, i) => wooProduct(first - i)));
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 10,
		});

		const result = await schedulerFetcher(productTask());

		// limit=25 at dial=10: three FULL pages (per_page=10 on every request,
		// including the last), trimmed to 25 locally — never a shrunk page 3.
		const searchCalls = fetcher.mock.calls
			.map(([url]) => url)
			.filter((url: string) => url.includes('search='));
		expect(searchCalls).toEqual([
			'http://wcpos.local/wp-json/wcpos/v2/products?search=keyboard&per_page=10&page=1&orderby=id&order=desc&status=publish',
			'http://wcpos.local/wp-json/wcpos/v2/products?search=keyboard&per_page=10&page=2&orderby=id&order=desc&status=publish',
			'http://wcpos.local/wp-json/wcpos/v2/products?search=keyboard&per_page=10&page=3&orderby=id&order=desc&status=publish',
		]);
		// The tail is the true tail (ids 1000-976, in order), not a re-read of page 2's rows.
		expect(repository.upsertMany).toHaveBeenCalledWith(
			Array.from({ length: 25 }, (_, i) =>
				expect.objectContaining({ remoteId: remoteId(1000 - i) })
			)
		);
		// The leg filled its limit with no short page — the server may hold more
		// matches, so the search coverage is honestly incomplete.
		expect(result).toEqual({
			taskId: 'products:search:keyboard:windowed',
			documentCount: 25,
			requestCount: 4,
			completed: false,
		});
	});

	it('requests the browse window at the dial page size, not the window size', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 321,
					name: 'Apron',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(321),
				},
			])
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
			pullBatchSize: () => 10,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:browse-window:limit=100:windowed',
				requirementId: 'products.browse-window.limit.100',
				queryKey: 'products:browse-window:limit=100',
				limit: 100,
			})
		);

		// A short first page exhausts the servable set without walking the rest of the
		// window, and per_page is the dial (10) even though the WINDOW is 100 rows (#908).
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/products?per_page=10&orderby=menu_order&order=asc&status=publish&page=1'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ uuid: uuidFor(321), remoteId: remoteId(321) }),
		]);
		// A page below the ceiling exhausts the servable set → complete coverage.
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'products',
			queryKey: 'products:browse-window:limit=100',
			records: [{ id: 'woo-product:321' }],
			complete: true,
			nowMs: 5_000,
			freshForMs: 60_000,
		});
		expect(result).toEqual({
			taskId: 'products:browse-window:limit=100:windowed',
			documentCount: 1,
			requestCount: 1,
			completed: true,
		});
	});

	it.each([
		{
			// Even an unfiltered walk records ONLY its own browse total —
			// census:products is probe-owned (#1400: the walk counts wcpos/v2,
			// the census counts wc/v3).
			name: 'unfiltered browse',
			queryKey: 'products:browse-window:limit=100',
			total: '42',
			brands: undefined,
			queryKeys: ['products:browse-window:limit=100'],
		},
		{
			name: 'filtered browse',
			queryKey: 'products:browse-window:limit=100:category=2',
			total: '12',
			brands: undefined,
			queryKeys: ['products:browse-window:limit=100:category=2'],
		},
		{
			name: 'fully validated brand browse',
			queryKey: 'products:browse-window:limit=100:brand=5',
			total: '1',
			brands: [{ id: 5 }],
			queryKeys: ['products:browse-window:limit=100:brand=5'],
		},
		{
			name: 'ignored brand filter',
			queryKey: 'products:browse-window:limit=100:brand=5',
			total: '7',
			brands: [{ id: 9 }],
			queryKeys: [],
		},
		{
			name: 'missing total header',
			queryKey: 'products:browse-window:limit=100',
			total: undefined,
			brands: undefined,
			queryKeys: [],
		},
	] as const)(
		'caches trustworthy totals for $name',
		async ({ queryKey, total, brands, queryKeys }) => {
			const cacheQueryTotals = vi.fn(async () => undefined);
			const schedulerFetcher = createProductsSchedulerFetcher({
				baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
				repository: {
					upsertMany: vi.fn(async () => undefined),
					removeMany: vi.fn(async () => undefined),
				},
				cacheQueryTotals,
				fetcher: vi.fn(async () => response([{ id: 1, brands, meta_data: posMeta(1) }], 1, total)),
			});

			await expect(
				schedulerFetcher(productTask({ id: `${queryKey}:windowed`, queryKey, limit: 100 }))
			).resolves.toMatchObject({ completed: true });
			if (queryKeys.length === 0) {
				expect(cacheQueryTotals).not.toHaveBeenCalled();
			} else {
				expect(cacheQueryTotals).toHaveBeenCalledWith({
					queryKeys,
					totalMatchingRecords: Number(total),
				});
			}
		}
	);

	it('withholds a brand-filtered total until the advertised result set is validated', async () => {
		const cacheQueryTotals = vi.fn(async () => undefined);
		const products = Array.from({ length: 100 }, (_, index) => ({
			id: index + 1,
			brands: [{ id: 5 }],
			meta_data: posMeta(index + 1),
		}));
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository: {
				upsertMany: vi.fn(async () => undefined),
				removeMany: vi.fn(async () => undefined),
			},
			cacheQueryTotals,
			fetcher: vi.fn(async () => response(products, 2, '101')),
		});

		await schedulerFetcher(
			productTask({
				id: 'products:browse-window:limit=100:brand=5:windowed',
				queryKey: 'products:browse-window:limit=100:brand=5',
				limit: 100,
			})
		);

		expect(cacheQueryTotals).not.toHaveBeenCalled();
	});

	it('keeps browse filters on phase-1 and phase-2 requests while applying the id tiebreak', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		// The store honours `brand`: every returned product carries the requested brand, so
		// the lane is allowed to complete (see the ignored-brand case below).
		const brands = [{ id: 5, name: 'Acme', slug: 'acme' }];
		const pageOneProducts = Array.from({ length: 100 }, (_, index) => ({
			id: index + 200,
			menu_order: 0,
			date_modified_gmt: '2026-05-20T10:10:00',
			brands,
			meta_data: posMeta(index + 200),
		}));
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			const page = new URL(String(request)).searchParams.get('page');
			if (page === '1') return response(pageOneProducts, 4);
			if (page === '2') {
				return response(
					Array.from({ length: 100 }, (_, index) => ({
						id: index + 300,
						menu_order: 0,
						date_modified_gmt: '2026-05-20T10:10:00',
						brands,
						meta_data: posMeta(index + 300),
					})),
					4
				);
			}
			if (page === '3') {
				return response(
					[
						{
							id: 1,
							menu_order: 0,
							date_modified_gmt: '2026-05-20T10:10:00',
							brands,
							meta_data: posMeta(1),
						},
						...Array.from({ length: 99 }, (_, index) => ({
							id: index + 400,
							menu_order: 1,
							date_modified_gmt: '2026-05-20T10:10:00',
							brands,
							meta_data: posMeta(index + 400),
						})),
					],
					4
				);
			}
			throw new Error(`Unexpected browse-window page ${page}`);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:browse-window:limit=100:windowed',
				queryKey:
					'products:browse-window:limit=100:category=2,7:tag=3:brand=5:featured=1:on_sale=0:stock_status=instock',
				limit: 100,
			})
		);

		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/products?per_page=100&orderby=menu_order&order=asc&status=publish&category=2%2C7&tag=3&brand=5&featured=true&on_sale=false&stock_status=instock&page=1'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/products?per_page=100&orderby=menu_order&order=asc&status=publish&category=2%2C7&tag=3&brand=5&featured=true&on_sale=false&stock_status=instock&page=2'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			3,
			'http://wcpos.local/wp-json/wcpos/v2/products?per_page=100&orderby=menu_order&order=asc&status=publish&category=2%2C7&tag=3&brand=5&featured=true&on_sale=false&stock_status=instock&page=3'
		);
		const upsertCalls = repository.upsertMany.mock.calls as unknown as [{ remoteId: RemoteId }[]][];
		expect(upsertCalls[0]?.[0].map(({ remoteId: id }) => wooIdOf(id))).toEqual([
			1,
			...Array.from({ length: 99 }, (_, index) => index + 200),
		]);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey:
					'products:browse-window:limit=100:category=2,7:tag=3:brand=5:featured=1:on_sale=0:stock_status=instock',
				complete: true,
			})
		);
		expect(result).toEqual({
			taskId: 'products:browse-window:limit=100:windowed',
			documentCount: 100,
			requestCount: 3,
			completed: true,
		});
	});

	// `brand` needs a WC version with core brands in the REST controller. An older store
	// ignores the param and answers with the unfiltered superset; recording that as a
	// COMPLETE lane would make the grid report the whole catalog as its brand-filtered total.
	// Mirrors the orders-side fix for the WCPOS proxy params (901761cc9).
	it('withholds lane completion when the store ignored the brand filter', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const diagnostics = vi.fn();
		const fetcher = vi.fn(async () =>
			response(
				[
					{
						id: 11,
						menu_order: 0,
						date_modified_gmt: '2026-05-20T10:10:00',
						brands: [{ id: 9, name: 'Other', slug: 'other' }],
						meta_data: posMeta(11),
					},
				],
				1
			)
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			diagnostics,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:browse-window:limit=100:brand=5:windowed',
				queryKey: 'products:browse-window:limit=100:brand=5',
				limit: 100,
			})
		);

		// The superset is still real product data — keep it locally…
		expect(repository.upsertMany).toHaveBeenCalled();
		expect(result).toMatchObject({ documentCount: 1 });
		// …but never as coverage for a brand the store demonstrably did not filter on.
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'products:browse-window:limit=100:brand=5',
				complete: false,
			})
		);
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'product.browse-window.brand-filter-ignored',
			})
		);
	});

	// A filtered result set that is an exact multiple of the page size never yields a short
	// page, so a short page alone cannot prove exhaustion. Without the X-WP-TotalPages stop
	// the walk asks for a page past the last, which WP answers with a 400 and the fetcher
	// turns into a failed browse. Same class as the orders fix 35be526ed.
	it('stops the window walk at the advertised last page', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			const page = Number(new URL(String(request)).searchParams.get('page'));
			// Two full pages of 25 and nothing beyond — exactly the exact-multiple case.
			if (page > 2) {
				return new Response(JSON.stringify({ code: 'rest_invalid_param' }), {
					status: 400,
				});
			}
			return response(
				Array.from({ length: 25 }, (_, index) => ({
					id: (page - 1) * 25 + index + 1,
					menu_order: 0,
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta((page - 1) * 25 + index + 1),
				})),
				2
			);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			pullBatchSize: () => 25,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:browse-window:limit=100:stock_status=outofstock:windowed',
				queryKey: 'products:browse-window:limit=100:stock_status=outofstock',
				limit: 100,
			})
		);

		// The 100-row window wants four 25-row pages; the server advertises two.
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			documentCount: 50,
			requestCount: 2,
			completed: true,
		});
	});

	it('bounds an all-tied browse window to the best rows from the scanned pages', async () => {
		// One page fills the 100-row window, then the tiebreak budget scans the rest.
		const maxPages = PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES + 1;
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const diagnostics = vi.fn();
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			const page = Number(new URL(String(request)).searchParams.get('page'));
			return response(
				Array.from({ length: 100 }, (_, index) => {
					const id = page <= maxPages ? (maxPages - page) * 100 + index + 1 : 10_000 + index;
					return {
						id,
						menu_order: 0,
						date_modified_gmt: '2026-05-20T10:10:00',
						meta_data: posMeta(id),
					};
				}),
				maxPages + 1
			);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			diagnostics,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:browse-window:limit=100:windowed',
				queryKey: 'products:browse-window:limit=100',
				limit: 100,
			})
		);

		expect(fetcher).toHaveBeenCalledTimes(maxPages);
		const upsertCalls = repository.upsertMany.mock.calls as unknown as [{ remoteId: RemoteId }[]][];
		expect(upsertCalls[0]?.[0].map(({ remoteId: id }) => wooIdOf(id))).toEqual(
			Array.from({ length: 100 }, (_, index) => index + 1)
		);
		expect(diagnostics).toHaveBeenCalledOnce();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'product.browse-window.approximate',
				level: 'warn',
				collection: 'products',
			})
		);
		expect(result).toEqual({
			taskId: 'products:browse-window:limit=100:windowed',
			documentCount: 100,
			requestCount: maxPages,
			completed: true,
		});
	});

	// -------------------------------------------------------------------------
	// #908 dial compliance / #909 window growth + sort
	// -------------------------------------------------------------------------

	/** A servable catalog of `count` products, page-served in the requested order. */
	function catalogServer(
		products: { id: number; menu_order?: number; price?: string }[],
		perPageSeen: number[]
	) {
		return vi.fn(async (request: RequestInfo | URL) => {
			const params = new URL(String(request)).searchParams;
			const perPage = Number(params.get('per_page'));
			const page = Number(params.get('page'));
			perPageSeen.push(perPage);
			const start = (page - 1) * perPage;
			const slice = products.slice(start, start + perPage).map((product) => ({
				...product,
				date_modified_gmt: '2026-05-20T10:10:00',
				meta_data: posMeta(product.id),
			}));
			return response(slice, Math.ceil(products.length / perPage));
		});
	}

	const browseTask = (overrides: Partial<FetchTask> = {}): FetchTask =>
		productTask({
			id: 'products:browse-window:limit=100:windowed',
			requirementId: 'products.browse-window.limit.100',
			queryKey: 'products:browse-window:limit=100',
			limit: 100,
			...overrides,
		});

	it('walks the 100-row window in four requests at pullBatchSize=25, never exceeding the dial', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		// Distinct menu_order values, so the window fills with no tiebreak walk at all.
		const products = Array.from({ length: 400 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const perPageSeen: number[] = [];
		const fetcher = catalogServer(products, perPageSeen);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 25,
		});

		const result = await schedulerFetcher(browseTask());

		// 4 pages fill the 100-row window; the 5th is the boundary probe — the row at the
		// window edge shares its menu_order with the last row fetched, so the fetcher has
		// to look one page further to know no lower id belongs inside the window. Under the
		// old code that probe cost a 100-record request; now it costs a dial-sized one.
		expect(result.requestCount).toBe(5);
		// THE #908 INVARIANT: no request ever asks for more than the dial allows.
		expect(perPageSeen).toEqual([25, 25, 25, 25, 25]);
		expect(Math.max(...perPageSeen)).toBeLessThanOrEqual(25);
		// Four dial-sized pages still seed the FULL 100-row window.
		expect(result.documentCount).toBe(100);
		const upserted = repository.upsertMany.mock.calls as unknown as [{ remoteId: RemoteId }[]][];
		expect(upserted[0]?.[0].map(({ remoteId: id }) => wooIdOf(id))).toEqual(
			Array.from({ length: 100 }, (_, index) => index + 1)
		);
	});

	it('grows past the seed: a 300-row window walks 6 pages at pullBatchSize=50', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 500 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const perPageSeen: number[] = [];
		const fetcher = catalogServer(products, perPageSeen);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 50,
		});

		const result = await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		// Windows past a single Woo page are exactly what makes infinite scroll work (#909):
		// 6 pages fill the 300-row window, plus the one boundary probe.
		expect(result.requestCount).toBe(7);
		expect(perPageSeen).toEqual([50, 50, 50, 50, 50, 50, 50]);
		expect(result.documentCount).toBe(300);
	});

	// -------------------------------------------------------------------------
	// #948 — windows page indefinitely, and grow by their DELTA
	// -------------------------------------------------------------------------

	/** A coverage repository that can answer "what does this lane already hold?". */
	function coverageWithLanes(lanes: Record<string, { complete: boolean; ids: string[] }>) {
		return {
			recordQueryResult: vi.fn(async () => undefined),
			readLocalLaneCoverage: vi.fn(async (_collection: string, queryKey: string) => {
				const lane = lanes[queryKey];
				return lane
					? {
							complete: lane.complete,
							fresh: true,
							expectedRecordIds: lane.ids,
						}
					: null;
			}),
		};
	}

	const wooProductIds = (from: number, count: number) =>
		Array.from({ length: count }, (_, index) => `woo-product:${from + index}`);

	/**
	 * #948 — the ruling, pinned at the wire.
	 *
	 * A 1,100-row window is PAST the old `PRODUCT_BROWSE_WINDOW_MAX_LIMIT = 1_000`. It used
	 * to be unreachable twice over: the parser rejected the key, and the encoder clamped
	 * every deeper limit onto `limit=1000` so the scheduler deduped it away. Now it runs —
	 * and it runs as a CONTINUATION: page 11 onwards, one step's worth of records, not a
	 * re-download of the first thousand.
	 */
	it('pages past the old 1,000-row ceiling, fetching only the uncovered delta', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 2_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const pagesSeen: number[] = [];
		const catalog = catalogServer(products, []);
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			pagesSeen.push(Number(new URL(String(request)).searchParams.get('page')));
			return catalog(request);
		});
		const coverageRepository = coverageWithLanes({
			// What the previous scroll tick left behind.
			'products:browse-window:limit=1000': {
				complete: true,
				ids: wooProductIds(1, 1_000),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
			pullBatchSize: () => 100,
		});

		const result = await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=1100:windowed',
				requirementId: 'products.browse-window.limit.1100',
				queryKey: 'products:browse-window:limit=1100',
				limit: 1_100,
			})
		);

		// THE DELTA PROPERTY: the walk resumes at page 11 (records 1,000+), never page 1.
		// Two requests — the step's page plus the usual boundary probe — where a
		// re-download would have cost eleven.
		expect(pagesSeen).toEqual([11, 12]);
		expect(result.documentCount).toBe(100);
		const upserted = repository.upsertMany.mock.calls as unknown as [{ remoteId: RemoteId }[]][];
		expect(upserted[0]?.[0].map(({ remoteId: id }) => wooIdOf(id))).toEqual(
			Array.from({ length: 100 }, (_, index) => 1_001 + index)
		);
		// The lane still describes the WHOLE window, prefix unioned with delta — the grid's
		// footer total reads this length, so a delta-only lane would report 100, not 1,100.
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: 'products:browse-window:limit=1100',
				records: wooProductIds(1, 1_100).map((id) => ({ id })),
				complete: true,
			})
		);
	});

	// #948 — the continuation is dimension-aware: a filtered window continues from ITS own
	// predecessor, never from the unfiltered one.
	it('continues a filtered window from the filtered predecessor lane', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 1_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const fetcher = catalogServer(products, []);
		const coverageRepository = coverageWithLanes({
			// The UNFILTERED lane is fresh and complete, and must be ignored.
			'products:browse-window:limit=200': {
				complete: true,
				ids: wooProductIds(1, 200),
			},
			'products:browse-window:limit=200:category=9': {
				complete: true,
				ids: wooProductIds(1, 200),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:category=9:windowed',
				queryKey: 'products:browse-window:limit=300:category=9',
				limit: 300,
			})
		);

		expect(coverageRepository.readLocalLaneCoverage).toHaveBeenCalledWith(
			'products',
			'products:browse-window:limit=200:category=9',
			expect.any(Number)
		);
		expect(coverageRepository.readLocalLaneCoverage).not.toHaveBeenCalledWith(
			'products',
			'products:browse-window:limit=200',
			expect.any(Number)
		);
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(repository.upsertMany).toHaveBeenCalledTimes(1);
		const [documents] = repository.upsertMany.mock.calls[0] as unknown as [
			{ remoteId: RemoteId }[],
		];
		expect(documents.map(({ remoteId: id }) => wooIdOf(id))).toEqual(
			Array.from({ length: 100 }, (_, index) => index + 201)
		);
		expect(fetcher.mock.calls.every(([url]) => String(url).includes('category=9'))).toBe(true);
	});

	// #948 — without a covered prefix the walk is unchanged: a cold deep window still
	// pages from the top, so removing the cap never depends on coverage being present.
	it('walks a deep window from page 1 when nothing is covered yet', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 2_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const pagesSeen: number[] = [];
		const catalog = catalogServer(products, []);
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			pagesSeen.push(Number(new URL(String(request)).searchParams.get('page')));
			return catalog(request);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 100,
		});

		const result = await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=1100:windowed',
				queryKey: 'products:browse-window:limit=1100',
				limit: 1_100,
			})
		);

		expect(pagesSeen.slice(0, 3)).toEqual([1, 2, 3]);
		expect(result.documentCount).toBe(1_100);
	});

	// #948 — a fresh, complete lane for this exact window is served local. This is what
	// stops the seeder's 30s completed-dedupe from re-walking a deep window twice a minute.
	it('serves a fresh, complete window from coverage without touching the wire', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () => response([]));
		const coverageRepository = coverageWithLanes({
			'products:browse-window:limit=1100': {
				complete: true,
				ids: wooProductIds(1, 1_100),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
		});

		const result = await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=1100:windowed',
				queryKey: 'products:browse-window:limit=1100',
				limit: 1_100,
			})
		);

		expect(fetcher).not.toHaveBeenCalled();
		// No coverage rewrite either: the lane must keep its own expiry, or the window
		// would be pinned fresh forever and never see a new product.
		expect(coverageRepository.recordQueryResult).not.toHaveBeenCalled();
		expect(result).toEqual({
			taskId: 'products:browse-window:limit=1100:windowed',
			documentCount: 0,
			requestCount: 0,
			completed: true,
		});
	});

	// #948 — an explicit user sync must not be answered from the prefix it is refreshing.
	it('re-walks from page 1 for an explicitly requested refresh', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 1_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const pagesSeen: number[] = [];
		const catalog = catalogServer(products, []);
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			pagesSeen.push(Number(new URL(String(request)).searchParams.get('page')));
			return catalog(request);
		});
		const coverageRepository = coverageWithLanes({
			'products:browse-window:limit=300': {
				complete: true,
				ids: wooProductIds(1, 300),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
			pullBatchSize: () => 100,
			refreshBrowseWindowKey: 'products:browse-window:limit=300',
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		expect(pagesSeen[0]).toBe(1);
	});

	/**
	 * #948 + the ancestry lesson from #1023.
	 *
	 * Reading the prefix and writing the union are not atomic, and `coverageLanes` rows are
	 * bulk-removed mid-drain by Clear & Sync (`registerCursorInvalidator`) and dropped whole
	 * by a ledger rebuild (#956/#959). Asserting the prefix anyway would resurrect coverage
	 * for a thousand products the wipe just deleted — and since a browse lane's
	 * `expectedRecordIds.length` IS the grid's footer total, and a complete+fresh lane is a
	 * serve-local answer, the grid would both report and believe coverage it does not hold.
	 */
	it('refuses to resurrect a prefix that was wiped mid-walk', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 2_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const fetcher = catalogServer(products, []);
		const diagnostics = vi.fn();
		let reads = 0;
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
			// First read (the continuation) sees the predecessor lane; the re-read at write
			// time sees nothing, exactly as a Clear & Sync landing mid-walk would leave it.
			readLocalLaneCoverage: vi.fn(async (_collection: string, queryKey: string) => {
				if (queryKey !== 'products:browse-window:limit=1000') return null;
				reads += 1;
				return reads === 1
					? {
							complete: true,
							fresh: true,
							expectedRecordIds: wooProductIds(1, 1_000),
						}
					: null;
			}),
		};
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			diagnostics,
			fetcher,
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=1100:windowed',
				queryKey: 'products:browse-window:limit=1100',
				limit: 1_100,
			})
		);

		// The lane claims NOTHING and is honestly INCOMPLETE, so the next pass restarts the
		// window from page 1. Recording the delta here would be worse than recording nothing:
		// the pass resumed at an offset, so its rows are a TAIL of the listing, and
		// readBrowseWindowContinuation reads a page-aligned incomplete lane as the LEADING
		// prefix — the next pass would offset past 100 rows nobody ever fetched.
		const recorded = coverageRepository.recordQueryResult.mock.calls[0] as unknown as [
			{ records: { id: string }[]; complete: boolean },
		];
		expect(recorded[0].records).toHaveLength(0);
		expect(recorded[0].complete).toBe(false);
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'browse-window.prefix-invalidated' })
		);
	});

	// -------------------------------------------------------------------------
	// #948/#957 follow-up — a completed window EVICTS the smaller ones it contains
	// -------------------------------------------------------------------------

	/**
	 * A coverage store that actually APPLIES the writes, so a scroll can be replayed as three
	 * real passes and the lanes inspected afterwards. The three eviction members mirror the
	 * Rx repository's semantics, including the compare-and-delete containment check.
	 */
	function statefulCoverage() {
		const lanes = new Map<
			string,
			{ complete: boolean; expectedRecordIds: string[]; updatedAtMs: number }
		>();
		return {
			lanes,
			recordQueryResult: vi.fn(
				async (input: {
					queryKey: string;
					records: { id: string }[];
					complete: boolean;
					nowMs: number;
				}) => {
					lanes.set(input.queryKey, {
						complete: input.complete,
						expectedRecordIds: input.records.map((record) => record.id),
						updatedAtMs: input.nowMs,
					});
				}
			),
			readLocalLaneCoverage: vi.fn(async (_collection: string, queryKey: string) => {
				const lane = lanes.get(queryKey);
				return lane
					? {
							complete: lane.complete,
							fresh: true,
							expectedRecordIds: [...lane.expectedRecordIds],
						}
					: null;
			}),
			listCoverageLanes: vi.fn(async () =>
				[...lanes.entries()].map(([queryKey, lane]) => ({ queryKey, ...lane }))
			),
			removeCoverageLaneIfContained: vi.fn(
				async (input: {
					queryKey: string;
					containedIn: readonly string[];
					supersededAtMs: number;
				}) => {
					const lane = lanes.get(input.queryKey);
					if (!lane || lane.updatedAtMs > input.supersededAtMs) return false;
					const containedIn = new Set(input.containedIn);
					if (!lane.expectedRecordIds.every((id) => containedIn.has(id))) return false;
					lanes.delete(input.queryKey);
					return true;
				}
			),
		};
	}

	/**
	 * THE RULING, replayed as a scroll (Paul, 2026-08-06).
	 *
	 * Three passes at limit=100, 200 then 400. Without eviction the store keeps all three
	 * lanes — 700 record ids to describe a 400-row window, and quadratic from there. With
	 * it, only the deepest window survives.
	 *
	 * Two assertions carry the weight:
	 *
	 *  - the footer: `projectTotal` reads `expectedRecordIds.length` for the grid's EXACT
	 *    current lane key, so the surviving lane must still carry the whole window; and
	 *  - the CONTINUATION CHAIN: each tick still costs ONE page. Eviction deletes everything
	 *    strictly below the window just filled, but the next tick only ever needs the lane
	 *    that just became the survivor — so #1030's "growth is a delta, not a re-download"
	 *    property survives eviction. A broken chain would show up here as four pages instead
	 *    of one.
	 */
	it('evicts the smaller windows a scrolled-to window contains, leaving the deepest intact', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 500 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const catalog = catalogServer(products, []);
		let pagesSeen: number[] = [];
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			pagesSeen.push(Number(new URL(String(request)).searchParams.get('page')));
			return catalog(request);
		});
		const coverageRepository = statefulCoverage();
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
			pullBatchSize: () => 100,
		});

		for (const [tick, limit] of [100, 200, 300, 400].entries()) {
			pagesSeen = [];
			await schedulerFetcher(
				browseTask({
					id: `products:browse-window:limit=${limit}:windowed`,
					queryKey: `products:browse-window:limit=${limit}`,
					limit,
				})
			);
			// After each tick, exactly one lane remains: the window the cashier is looking at.
			expect([...coverageRepository.lanes.keys()]).toEqual([
				`products:browse-window:limit=${limit}`,
			]);
			// …and the tick RESUMED at its own step rather than restarting at page 1, then cost
			// a constant one page plus at most the menu_order boundary probe.
			expect(pagesSeen[0]).toBe(tick + 1);
			expect(pagesSeen.length).toBeLessThanOrEqual(2);
		}

		// The survivor still describes the WHOLE window — the grid's footer total is unchanged
		// by eviction.
		expect(coverageRepository.lanes.get('products:browse-window:limit=400')).toMatchObject({
			complete: true,
		});
		expect(
			coverageRepository.lanes.get('products:browse-window:limit=400')!.expectedRecordIds
		).toHaveLength(400);
	});

	/**
	 * Eviction must run STRICTLY AFTER the lane write. The lane a growing window resumes from
	 * is the very lane it supersedes, and `browseWindowPrefixSurvived` re-reads it to decide
	 * whether the pass may assert its prefix — so evicting first would make every growth step
	 * demote itself to an incomplete delta and re-walk the window forever.
	 */
	it('still asserts the continued prefix on the pass that evicts the lane it came from', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 500 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const diagnostics = vi.fn();
		const coverageRepository = statefulCoverage();
		coverageRepository.lanes.set('products:browse-window:limit=200', {
			complete: true,
			expectedRecordIds: wooProductIds(1, 200),
			updatedAtMs: 4_000,
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			diagnostics,
			fetcher: catalogServer(products, []),
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		expect(diagnostics).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: 'browse-window.prefix-invalidated' })
		);
		expect([...coverageRepository.lanes.keys()]).toEqual(['products:browse-window:limit=300']);
		expect(
			coverageRepository.lanes.get('products:browse-window:limit=300')!.expectedRecordIds
		).toHaveLength(300);
	});

	// The pre-walk guard cannot see a wipe that lands inside `withLedgerRecovery`'s replay of
	// the write, so the write itself must be able to re-check. This pins that the fetcher
	// actually hands the ancestry down — the persistence-side behaviour is covered by
	// local-coverage/browse-window-prefix-ancestry.test.ts.
	it('hands the carried prefix to the coverage write so a replay can re-check it', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 500 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const coverageRepository = statefulCoverage();
		coverageRepository.lanes.set('products:browse-window:limit=200', {
			complete: true,
			expectedRecordIds: wooProductIds(1, 200),
			updatedAtMs: 4_000,
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher: catalogServer(products, []),
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		const write = coverageRepository.recordQueryResult.mock.calls.at(-1)![0] as {
			prefixAncestry?: {
				sourceQueryKey: string;
				recordIds: string[];
				fallbackRecordIds: string[];
			};
		};
		expect(write.prefixAncestry?.sourceQueryKey).toBe('products:browse-window:limit=200');
		expect(write.prefixAncestry?.recordIds).toEqual(wooProductIds(1, 200));
		// The fallback is the delta alone — what the lane must shrink to if the prefix is gone.
		expect(write.prefixAncestry?.fallbackRecordIds).toEqual(wooProductIds(201, 100));
	});

	// A window that carried nothing has no ancestry to assert, so it must not send one.
	it('sends no prefix ancestry when the window started from scratch', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = statefulCoverage();
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher: catalogServer(
				Array.from({ length: 50 }, (_, index) => ({
					id: index + 1,
					menu_order: index,
				})),
				[]
			),
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=10:windowed',
				queryKey: 'products:browse-window:limit=10',
				limit: 10,
			})
		);

		expect(coverageRepository.recordQueryResult.mock.calls.at(-1)![0]).not.toHaveProperty(
			'prefixAncestry'
		);
	});

	/**
	 * A HOST WITHOUT THE EVICTION SURFACE keeps working. Older coverage repositories (the
	 * playground, every test above) expose only `recordQueryResult`, so the sweep is a no-op
	 * and lanes reclaim on the 15-minute expiry exactly as before.
	 */
	it('leaves lanes alone when the coverage repository cannot evict', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 200 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher: catalogServer(products, []),
			pullBatchSize: () => 100,
		});

		await expect(schedulerFetcher(browseTask())).resolves.toMatchObject({
			completed: true,
		});
	});

	/**
	 * REGRESSION — the tie-heavy catalogue (#948 review findings, HIGH ×2).
	 *
	 * Every `menu_order` is 0, which the fetcher's own comment calls "the common case". The
	 * phase-2 tiebreak walk then scans far past the window and keeps the LOWEST ids it
	 * finds, so a filled lane is "the N lowest ids in wire[0, N+1900)" — NOT wire[0, N).
	 * Resuming positionally from its length re-reads rows the prefix already holds and the
	 * merge dedupes them away, so the walk yields NOTHING new.
	 *
	 * The exact-fill + page-alignment gate cannot catch this: the all-tied trace leaves
	 * exactly 200 unique ids for a 300-row lane, and 200 is page-aligned, so the gate
	 * accepts it and every retry repeats identically — a silent freeze. Progress, not shape,
	 * is the honest test: a resumed walk that did not move the window falls back to a full
	 * walk in the SAME pass, so the window converges instead of stalling.
	 */
	it('falls back to a full walk when a resumed window cannot make progress', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		// Every product ties on menu_order, and the server hands them back id-DESC, so the
		// window is only reachable by substitution from later pages.
		const products = Array.from({ length: 2_000 }, (_, index) => ({
			id: 2_000 - index,
			menu_order: 0,
		}));
		const pagesSeen: number[] = [];
		const catalog = catalogServer(products, []);
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			pagesSeen.push(Number(new URL(String(request)).searchParams.get('page')));
			return catalog(request);
		});
		const coverageRepository = coverageWithLanes({
			'products:browse-window:limit=200': {
				complete: true,
				ids: wooProductIds(1, 200),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		// The resume was attempted (page 3) and then abandoned for a walk from the top.
		expect(pagesSeen[0]).toBe(3);
		expect(pagesSeen).toContain(1);
		// Exactly ONE lane is written — the fruitless resume must not leave a short lane
		// behind for the re-walk to overwrite a moment later.
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledTimes(1);
		const [recorded] = coverageRepository.recordQueryResult.mock.calls[0] as unknown as [
			{ records: { id: string }[]; complete: boolean },
		];
		// …and it is the FULL window, so the grid keeps growing rather than freezing at 200.
		expect(recorded.records).toHaveLength(300);
		expect(recorded.complete).toBe(true);
	});

	/**
	 * COMPOSITION — eviction vs the progress-not-shape fallback above.
	 *
	 * The fallback introduces a pass that walks, writes NO lane, and returns. Eviction fires
	 * on "the deepest settled lane just written", so a sweep running off that fruitless pass
	 * would be reasoning about a lane that does not exist — and the lanes it would delete are
	 * the very ones the re-walk is about to resume nothing from.
	 *
	 * It cannot happen: the fruitless walk returns BEFORE `recordCoverage`, so the sweep is
	 * never reached. The full re-walk that follows in the same pass writes the window and
	 * evicts. Net effect: exactly one lane write and exactly one sweep, both from the
	 * productive walk.
	 */
	it('evicts once from the re-walk, not from the fruitless resume that preceded it', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 2_000 }, (_, index) => ({
			id: 2_000 - index,
			menu_order: 0,
		}));
		const coverageRepository = statefulCoverage();
		// What earlier scroll ticks left behind; the 200 lane is what the resume comes from.
		coverageRepository.lanes.set('products:browse-window:limit=100', {
			complete: true,
			expectedRecordIds: wooProductIds(1, 100),
			updatedAtMs: 1_000,
		});
		coverageRepository.lanes.set('products:browse-window:limit=200', {
			complete: true,
			expectedRecordIds: wooProductIds(1, 200),
			updatedAtMs: 2_000,
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher: catalogServer(products, []),
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		// One lane write (the re-walk's) and one sweep — the fruitless resume did neither.
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledTimes(1);
		expect(coverageRepository.listCoverageLanes).toHaveBeenCalledTimes(1);
		// The superseded windows are gone and the deepest one carries the whole window.
		expect([...coverageRepository.lanes.keys()]).toEqual(['products:browse-window:limit=300']);
		expect(
			coverageRepository.lanes.get('products:browse-window:limit=300')!.expectedRecordIds
		).toHaveLength(300);
	});

	/**
	 * REGRESSION — a resume page that no longer exists (#957 review finding, P2).
	 *
	 * Records deleted since the prefix was written can pull the listing's last page below
	 * the resume offset, and WP answers an out-of-range `page` with a 400. Failing the task
	 * would strand the window: every retry re-requests the same dead page until coverage
	 * expires. The walk restarts from page 1 instead.
	 */
	it('restarts from page 1 when the resume page no longer exists', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 120 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const pagesSeen: number[] = [];
		const catalog = catalogServer(products, []);
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			const page = Number(new URL(String(request)).searchParams.get('page'));
			pagesSeen.push(page);
			// The catalogue shrank: page 3 is past the end and WP 400s rather than
			// returning an empty page.
			if (page > 2) {
				return new Response(JSON.stringify({ code: 'rest_post_invalid_page_number' }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				});
			}
			return catalog(request);
		});
		const coverageRepository = coverageWithLanes({
			'products:browse-window:limit=200': {
				complete: true,
				ids: wooProductIds(1, 200),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
			pullBatchSize: () => 100,
		});

		const result = await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		// It asked for the dead resume page, then restarted from the top instead of throwing.
		expect(pagesSeen[0]).toBe(3);
		expect(pagesSeen).toContain(1);
		expect(result.documentCount).toBe(120);
	});

	/**
	 * REGRESSION — a ragged lane must never become a wire offset. 215 ids for a 300-row
	 * window is a dedupe/substitution shortfall, not a clean page stop; offsetting from it
	 * misaligns every later step. The gate refuses it and re-walks from page 1.
	 */
	it('re-walks from page 1 rather than offsetting from a ragged lane', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 2_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const pagesSeen: number[] = [];
		const catalog = catalogServer(products, []);
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			pagesSeen.push(Number(new URL(String(request)).searchParams.get('page')));
			return catalog(request);
		});
		const coverageRepository = coverageWithLanes({
			// 215 of 300 — not page-aligned at 100/page, so not a usable offset.
			'products:browse-window:limit=300': {
				complete: false,
				ids: wooProductIds(1, 215),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
			pullBatchSize: () => 100,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		expect(pagesSeen[0]).toBe(1);
	});

	/**
	 * REGRESSION — COL22 on a page-boundary duplicate.
	 *
	 * `bulkUpsert()` REJECTS an input carrying duplicate primary keys ("cannot be run with
	 * multiple documents that have the same primary key", rx-collection COL22). The browse
	 * walk concatenates pages verbatim, so a product inserted mid-walk — which shifts every
	 * later row down a wire slot and repeats one across the boundary — made the whole browse
	 * throw AFTER several successful requests. Uncapped windows walk more pages, so they meet
	 * this more often. Same defect the customers lane fixed in bddd21d17; same remedy.
	 */
	it('dedupes a page-boundary repeat before upserting, so a mid-walk insert cannot fail the browse', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		// Page 2 repeats id 20 from page 1 — exactly what an insert between the two requests
		// produces.
		const page1 = Array.from({ length: 20 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const page2 = [
			{ id: 20, menu_order: 19 },
			...Array.from({ length: 19 }, (_, index) => ({
				id: 21 + index,
				menu_order: 20 + index,
			})),
		];
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			const page = Number(new URL(String(request)).searchParams.get('page'));
			const slice = (page === 1 ? page1 : page2).map((product) => ({
				...product,
				date_modified_gmt: '2026-05-20T10:10:00',
				meta_data: posMeta(product.id),
			}));
			return response(slice, 2);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 20,
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=40:windowed',
				queryKey: 'products:browse-window:limit=40',
				limit: 40,
			})
		);

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(repository.upsertMany).toHaveBeenCalledTimes(1);
		const [upsertedDocuments] = repository.upsertMany.mock.calls[0] as unknown as [
			{ uuid: string; remoteId: RemoteId }[],
		];
		expect(upsertedDocuments.map(({ remoteId: id }) => wooIdOf(id))).toEqual(
			Array.from({ length: 39 }, (_, index) => index + 1)
		);
		for (const [documents] of repository.upsertMany.mock.calls as unknown as [
			{ uuid: string }[],
		][]) {
			const ids = documents.map(({ uuid }) => uuid);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	/**
	 * REGRESSION — a forced refresh must not strip the continuation from OTHER windows
	 * (#948 review finding, P2). A drain executes every runnable persisted task, not only
	 * the one just seeded, so a drain-wide boolean would make every queued browse window
	 * re-walk from page 1 — up to 50 extra requests each — for a refresh the cashier asked
	 * of one grid. The key is carried instead, and only the matching lane re-walks.
	 */
	it('scopes a forced refresh to the requested lane, leaving other windows resumable', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 2_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const pagesSeen: number[] = [];
		const catalog = catalogServer(products, []);
		const fetcher = vi.fn(async (request: RequestInfo | URL) => {
			pagesSeen.push(Number(new URL(String(request)).searchParams.get('page')));
			return catalog(request);
		});
		const coverageRepository = coverageWithLanes({
			'products:browse-window:limit=200': {
				complete: true,
				ids: wooProductIds(1, 200),
			},
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
			pullBatchSize: () => 100,
			// A DIFFERENT grid is being refreshed.
			refreshBrowseWindowKey: 'products:browse-window:limit=500:category=9',
		});

		await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=300:windowed',
				queryKey: 'products:browse-window:limit=300',
				limit: 300,
			})
		);

		// This window keeps its continuation: it resumes at page 3 rather than page 1.
		expect(pagesSeen[0]).toBe(3);
	});

	/**
	 * A page-budget truncation ALWAYS advances (#948 review thread — refutation, pinned).
	 *
	 * The review's concern was that a truncated walk could "repeatedly fetch the same first
	 * 50 pages without advancing". It cannot: a budget truncation stops on a whole page, so
	 * the short lane it leaves is page-aligned by construction and the own-lane branch
	 * resumes from it. Successive drains therefore walk 1-50, 51-100, … and the window
	 * converges. This test drives three drains over a lane store that behaves like the real
	 * repository (the fetcher's own writes are what the next drain reads).
	 */
	it('advances the window on every drain after a page-budget truncation', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		// 15,000 products, dial at 100 ⇒ 150 pages for a 15,000-row window; the budget is 50.
		const products = Array.from({ length: 15_000 }, (_, index) => ({
			id: index + 1,
			menu_order: index,
		}));
		const fetcher = catalogServer(products, []);
		// A stateful lane store: whatever the fetcher records, the next drain reads back.
		const lanes = new Map<string, { complete: boolean; ids: string[] }>();
		const coverageRepository = {
			recordQueryResult: vi.fn(
				async (value: { queryKey: string; records: { id: string }[]; complete: boolean }) => {
					lanes.set(value.queryKey, {
						complete: value.complete,
						ids: value.records.map(({ id }) => id),
					});
				}
			),
			readLocalLaneCoverage: vi.fn(async (_collection: string, queryKey: string) => {
				const lane = lanes.get(queryKey);
				return lane
					? {
							complete: lane.complete,
							fresh: true,
							expectedRecordIds: lane.ids,
						}
					: null;
			}),
		};
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
			pullBatchSize: () => 100,
		});
		const task = browseTask({
			id: 'products:browse-window:limit=15000:windowed',
			queryKey: 'products:browse-window:limit=15000',
			limit: 15_000,
		});

		const covered: number[] = [];
		for (let drain = 0; drain < 3; drain += 1) {
			await schedulerFetcher(task);
			covered.push(lanes.get('products:browse-window:limit=15000')!.ids.length);
		}

		// Strictly increasing, 50 pages at a time — never the same 50 pages twice.
		expect(covered).toEqual([5_000, 10_000, 15_000]);
		expect(lanes.get('products:browse-window:limit=15000')!.complete).toBe(true);
	});

	it('resolves the id tiebreak across a page seam when the dial splits the window', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		// Every product ties on menu_order=0 and the server hands them back id-DESC, so the
		// correct window (menu_order asc, id asc) is only reachable by walking past the seam.
		const products = Array.from({ length: 60 }, (_, index) => ({
			id: 60 - index,
			menu_order: 0,
		}));
		const perPageSeen: number[] = [];
		const fetcher = catalogServer(products, perPageSeen);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 20,
		});

		const result = await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=40:windowed',
				queryKey: 'products:browse-window:limit=40',
				limit: 40,
			})
		);

		// 2 pages fill the 40-row window; the boundary is still menu_order=0, so the walk
		// continues until the server runs short — and the window holds the LOWEST 40 ids.
		expect(perPageSeen.every((perPage) => perPage <= 20)).toBe(true);
		expect(result.requestCount).toBe(3);
		const upserted = repository.upsertMany.mock.calls as unknown as [{ remoteId: RemoteId }[]][];
		expect(upserted[0]?.[0].map(({ remoteId: id }) => wooIdOf(id))).toEqual(
			Array.from({ length: 40 }, (_, index) => index + 1)
		);
	});

	it('seeds a server-sorted window for a non-default sort instead of re-sorting locally', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		// Server order IS the answer for price desc — highest price first.
		const products = Array.from({ length: 40 }, (_, index) => ({
			id: 900 - index,
			menu_order: 0,
			price: String(1_000 - index),
		}));
		const perPageSeen: number[] = [];
		const fetcher = catalogServer(products, perPageSeen);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			pullBatchSize: () => 20,
		});

		const result = await schedulerFetcher(
			browseTask({
				id: 'products:browse-window:limit=40:orderby=price:order=desc:windowed',
				queryKey: 'products:browse-window:limit=40:orderby=price:order=desc',
				limit: 40,
			})
		);

		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/products?per_page=20&orderby=price&order=desc&status=publish&page=1'
		);
		// No menu_order/id tiebreak walk on a non-default sort: the server's own order is
		// authoritative, so it is exactly ceil(40 / 20) requests.
		expect(result.requestCount).toBe(2);
		const upserted = repository.upsertMany.mock.calls as unknown as [{ remoteId: RemoteId }[]][];
		// Server order preserved — NOT re-sorted into menu_order/id order locally.
		expect(upserted[0]?.[0].map(({ remoteId: id }) => wooIdOf(id))).toEqual(
			Array.from({ length: 40 }, (_, index) => 900 - index)
		);
	});

	it('populates the Leg-3 manifest only for products that survive the apply guard', async () => {
		const repository = {
			upsertMany: vi.fn(async (documents: StoredProductDocument[]) => documents.slice(0, 1)),
			removeMany: vi.fn(async () => undefined),
		};
		const manifestSink = vi.fn(async () => undefined);
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 321,
					name: 'Keyboard',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(321),
					_rxdb_digest: '9223372036854775810',
				},
				{
					id: 654,
					name: 'Mouse',
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: posMeta(654),
					_rxdb_digest: 'digest-654',
				},
			])
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			manifestSink,
		});

		await schedulerFetcher(productTask());

		// The manifest receives the {wooId, digest} row (digest a string — un-truncated).
		expect(manifestSink).toHaveBeenCalledWith([
			{
				remoteId: '321',
				wooId: 321,
				objectType: 'product',
				digest: '9223372036854775810',
			},
		]);
		// The stored payload is stripped of _rxdb_digest (never persisted into the product doc).
		const calls = repository.upsertMany.mock.calls as unknown as [
			{ payload: Record<string, unknown> }[],
		][];
		const upserted = calls[0]?.[0]?.[0];
		expect(upserted).toBeDefined();
		expect('_rxdb_digest' in (upserted?.payload ?? {})).toBe(false);
		expect(upserted?.payload).toEqual({
			id: 321,
			name: 'Keyboard',
			date_modified_gmt: '2026-05-20T10:10:00',
			meta_data: posMeta(321),
		});
	});

	it.each([
		['reader absent', undefined],
		['reader returns true', () => true],
	] as const)('merges and prioritizes exact SKU matches with %s', async (_case, exactSkuLeg) => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async (url: string) => {
			if (url.includes('sku=KEY-101')) {
				return response([
					{
						id: 101,
						sku: 'KEY-101',
						name: 'Keyboard Stand',
						date_modified_gmt: '2026-05-20T10:10:00',
						meta_data: posMeta(101),
					},
				]);
			}
			return response([
				{
					id: 101,
					sku: 'OTHER',
					name: 'Fuzzy search copy',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(101),
				},
			]);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			...(exactSkuLeg === undefined ? {} : { exactSkuLeg }),
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:search:KEY-101:windowed',
				queryKey: 'products:search:KEY-101',
			})
		);

		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/products?sku=KEY-101&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/products?search=KEY-101&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				uuid: uuidFor(101),
				remoteId: remoteId(101),
				payload: expect.objectContaining({ name: 'Keyboard Stand', sku: 'KEY-101' }),
			}),
		]);
		expect(result).toEqual({
			taskId: 'products:search:KEY-101:windowed',
			documentCount: 1,
			requestCount: 2,
			completed: true,
		});
	});

	it('preserves exact SKU matches when search results fill the task limit', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async (url: string) => {
			if (url.includes('sku=KEY-101')) {
				return response([
					{
						id: 101,
						sku: 'KEY-101',
						name: 'Keyboard Stand',
						date_modified_gmt: '2026-05-20T10:10:00',
						meta_data: posMeta(101),
					},
				]);
			}
			return response([
				{
					id: 201,
					name: 'Keyboard A',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(201),
				},
				{
					id: 202,
					name: 'Keyboard B',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(202),
				},
			]);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		await schedulerFetcher(
			productTask({
				id: 'products:search:KEY-101:windowed',
				queryKey: 'products:search:KEY-101',
				limit: 2,
			})
		);

		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ uuid: uuidFor(101), remoteId: remoteId(101) }),
			expect.objectContaining({ uuid: uuidFor(201), remoteId: remoteId(201) }),
		]);
	});

	it('withholds lane completion when cross-leg dedupe overflows the persisted window', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		// Both legs exhaust (short pages), but their union (3) exceeds limit (2): the
		// persisted set is truncated, so the lane must not read back as complete.
		const fetcher = vi.fn(async (url: string) => {
			if (url.includes('sku=KEY-101')) {
				return response([
					{
						id: 101,
						sku: 'KEY-101',
						name: 'Keyboard Stand',
						date_modified_gmt: '2026-05-20T10:10:00',
						meta_data: posMeta(101),
					},
				]);
			}
			return response([
				{
					id: 201,
					name: 'Keyboard A',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(201),
				},
				{
					id: 202,
					name: 'Keyboard B',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(202),
				},
			]);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:search:KEY-101:windowed',
				queryKey: 'products:search:KEY-101',
				limit: 2,
			})
		);

		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({ complete: false })
		);
		expect(result.completed).toBe(false);
	});

	it('records incomplete product search coverage when the first page is full', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const products = Array.from({ length: 2 }, (_, index) => ({
			id: index + 1,
			date_modified_gmt: '2026-05-20T10:10:00',
			meta_data: posMeta(index + 1),
		}));
		const fetcher = vi.fn(async () => response(products));
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		const result = await schedulerFetcher(productTask({ limit: 2 }));

		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'products',
			queryKey: 'products:search:keyboard',
			records: [{ id: 'woo-product:1' }, { id: 'woo-product:2' }],
			complete: false,
			nowMs: 5_000,
			freshForMs: 60_000,
		});
		expect(result.completed).toBe(false);
	});

	it('passes raw percent signs in product search terms through URLSearchParams', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		await schedulerFetcher(
			productTask({
				id: 'products:search:100% cotton:windowed',
				queryKey: 'products:search:100% cotton',
			})
		);

		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/products?sku=100%25+cotton&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/products?search=100%25+cotton&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
	});

	it('fetches targeted product tasks through Woo REST include and records complete coverage', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 321,
					status: 'publish',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(321),
				},
				{
					id: 654,
					status: 'publish',
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: posMeta(654),
				},
			])
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			nowMs: () => 5_000,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:ids:321,654:on-demand',
				requirementId: 'products.cart-items',
				queryKey: 'products:ids:321,654',
				documentIds: ['woo-product:321', 'woo-product:654'],
				remoteIds: [321, 654].map(remoteId),
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/products?include=321%2C654&per_page=2&orderby=include'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ uuid: uuidFor(321), remoteId: remoteId(321) }),
			expect.objectContaining({ uuid: uuidFor(654), remoteId: remoteId(654) }),
		]);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'products',
			queryKey: 'products:ids:321,654',
			records: [{ id: 'woo-product:321' }, { id: 'woo-product:654' }],
			complete: true,
			nowMs: 5_000,
			freshForMs: 300_000,
		});
		expect(result).toEqual({
			taskId: 'products:ids:321,654:on-demand',
			documentCount: 2,
			requestCount: 1,
			completed: true,
		});
	});

	it('removes a targeted non-publish product without treating the response as a shortfall', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 321,
					status: 'draft',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(321),
				},
			])
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:ids:321:on-demand',
				requirementId: 'products.cart-items',
				queryKey: 'products:ids:321',
				documentIds: ['woo-product:321'],
				remoteIds: [321].map(remoteId),
				limit: 1,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/products?include=321&per_page=1&orderby=include'
		);
		expect(repository.upsertMany).not.toHaveBeenCalled();
		expect(repository.removeMany).toHaveBeenCalledWith([
			expect.objectContaining({
				uuid: uuidFor(321),
				remoteId: remoteId(321),
				payload: expect.objectContaining({ status: 'draft' }),
			}),
		]);
		expect(result).toEqual({
			taskId: 'products:ids:321:on-demand',
			documentCount: 0,
			requestCount: 1,
			completed: true,
		});
	});

	it('reads the numeric server ids from task.remoteIds, decoupled from the document-key encoding', async () => {
		// ids are deliberately opaque (a uuid + garbage): the document keys are never
		// parsed — remoteIds is the only channel for the numeric server ids.
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 321,
					status: 'publish',
					date_modified_gmt: '2026-05-20T10:10:00',
					meta_data: posMeta(321),
				},
				{
					id: 654,
					status: 'publish',
					date_modified_gmt: '2026-05-20T10:11:00',
					meta_data: posMeta(654),
				},
			])
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			nowMs: () => 5_000,
			fetcher,
		});

		await schedulerFetcher(
			productTask({
				id: 'products:ids:deep-link:on-demand',
				requirementId: 'products.cart-items',
				queryKey: 'products:ids:deep-link',
				remoteIds: [321, 654].map(remoteId),
				documentIds: ['8e29c1a4-3b2d-4f6a-9c0e-1d2f3a4b5c6d', 'not-a-woo-product-key'],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/products?include=321%2C654&per_page=2&orderby=include'
		);
	});

	it('fails a targeted product task that is missing its remoteIds channel (contract error, no reverse-parse)', async () => {
		// The `/^woo-product:(\d+)$/` reverse-parse scaffolding is deleted: a targeted task
		// without remoteIds is a seeder contract violation, surfaced — never silently parsed.
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		await expect(
			schedulerFetcher(
				productTask({
					id: 'products:ids:321,654:on-demand',
					requirementId: 'products.cart-items',
					queryKey: 'products:ids:321,654',
					documentIds: ['woo-product:321', 'woo-product:654'],
					limit: 2,
					mode: 'on-demand',
				})
			)
		).rejects.toThrow(
			'Targeted product scheduler task is missing its remoteIds channel: products:ids:321,654:on-demand'
		);
		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.upsertMany).not.toHaveBeenCalled();
	});

	it('never persists a variation-typed row from the sku leg into the products collection', async () => {
		// Woo's products route answers a sku= filter with matching VARIATIONS as rows
		// (verified live on dev-pro 2026-08-20: GET wcpos/v1/products?sku=733620209958
		// returns {id: 68023, type: 'variation', parent_id: 66566}). Persisting that row
		// here puts the variation into the PRODUCTS collection; the barcode scan then
		// finds the same record in both collections and every scan of that code turns
		// falsely ambiguous ("2 products found locally") — permanently, since both
		// copies share one uuid and sync maintains each in its own collection.
		const upserted: { payload: { id: number; type?: string } }[][] = [];
		const repository = {
			upsertMany: vi.fn(async (documents: unknown[]) => {
				upserted.push(documents as { payload: { id: number; type?: string } }[]);
			}),
			removeMany: vi.fn(async () => undefined),
		};
		const variationRow = {
			id: 68023,
			name: 'Troy Yoga Short - 32, Green',
			type: 'variation',
			parent_id: 66566,
			status: 'publish',
			sku: '733620209958',
			date_modified_gmt: '2026-08-20T15:01:04',
			meta_data: posMeta(68023),
		};
		const fetcher = vi.fn(async (url: string) =>
			new URL(url).searchParams.has('sku') ? response([variationRow]) : response([])
		);
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
			barcodeSelectors: () => ({ products: ['sku'], variations: ['sku'] }),
			exactSkuLeg: () => true,
		});

		await schedulerFetcher(
			productTask({
				id: 'products:search:733620209958:windowed',
				queryKey: 'products:search:733620209958',
			})
		);

		// Both legs ran (the term is long enough for the search leg).
		const requestLegs = fetcher.mock.calls.map(([url]) => new URL(url).searchParams.has('sku'));
		expect(requestLegs).toEqual([true, false]);
		expect(upserted.flat()).toEqual([]);
	});
});

describe('coverageRecordId', () => {
	const doc = (over: Partial<ProductDocument>): ProductDocument => ({
		uuid: 'woo-product:1',
		remoteId: remoteId(1),
		payload: {} as ProductDocument['payload'],
		sync: {} as ProductDocument['sync'],
		local: { dirty: false, pendingMutationIds: [] },
		...over,
	});

	it('keys product coverage by the stable wooId, decoupled from the storage id (uuid-ready)', () => {
		// Simulate a post-emit-flip document with a uuid storage key and remote identity.
		// Coverage must use the wooId-key so the deep-link lookup (woo-product:<wooId>) matches.
		const result = coverageRecordId(
			doc({
				uuid: '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d',
				remoteId: remoteId(321),
			})
		);
		expect(result).toBe('woo-product:321'); // the wooId-key, NOT the uuid storage id
	});

	it('falls back to the storage id for a born-local product with no remoteId', () => {
		expect(coverageRecordId(doc({ uuid: 'local-keyed', remoteId: null }))).toBe('local-keyed');
	});
});
