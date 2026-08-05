// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { ProductDocument } from '@wcpos/sync-core';

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

function response(payload: unknown[], totalPages?: number): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			...(totalPages === undefined ? {} : { 'x-wp-totalpages': String(totalPages) }),
		},
	});
}

// Server-stamped identity: a deterministic v4-shaped uuid per Woo id, so the post-flip
// STORAGE key (document.id) is predictable. The numeric wooId survives as `wooProductId`
// and as the `woo-product:<id>` COVERAGE key (decoupled from storage — see #234).
const uuidFor = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const posMeta = (n: number) => [{ key: '_woocommerce_pos_uuid', value: uuidFor(n) }];

describe('createProductsSchedulerFetcher', () => {
	it('runs only the exact SKU leg for a two-character search', async () => {
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
		]);
		expect(result).toMatchObject({ requestCount: 1, completed: true });
	});

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
			'http://wcpos.local/wp-json/wcpos/v2/products?search=keyboard&per_page=10&page=1&orderby=id&order=desc&status=publish'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/products?sku=keyboard&per_page=10&page=1&orderby=id&order=desc&status=publish'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			{
				id: uuidFor(321),
				wooProductId: 321,
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
			Array.from({ length: 25 }, (_, i) => expect.objectContaining({ wooProductId: 1000 - i }))
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
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
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
			expect.objectContaining({ id: uuidFor(321), wooProductId: 321 }),
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

	it('keeps browse filters on phase-1 and phase-2 requests while applying the id tiebreak', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
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
		const upsertCalls = repository.upsertMany.mock.calls as unknown as [
			{ wooProductId: number }[],
		][];
		expect(upsertCalls[0]?.[0].map(({ wooProductId }) => wooProductId)).toEqual([
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
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
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
			expect.objectContaining({ type: 'product.browse-window.brand-filter-ignored' })
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
				return new Response(JSON.stringify({ code: 'rest_invalid_param' }), { status: 400 });
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
		expect(result).toMatchObject({ documentCount: 50, requestCount: 2, completed: true });
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
		const upsertCalls = repository.upsertMany.mock.calls as unknown as [
			{ wooProductId: number }[],
		][];
		expect(upsertCalls[0]?.[0].map(({ wooProductId }) => wooProductId)).toEqual(
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
		const upserted = repository.upsertMany.mock.calls as unknown as [{ wooProductId: number }[]][];
		expect(upserted[0]?.[0].map(({ wooProductId }) => wooProductId)).toEqual(
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
		const upserted = repository.upsertMany.mock.calls as unknown as [{ wooProductId: number }[]][];
		expect(upserted[0]?.[0].map(({ wooProductId }) => wooProductId)).toEqual(
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
		const upserted = repository.upsertMany.mock.calls as unknown as [{ wooProductId: number }[]][];
		// Server order preserved — NOT re-sorted into menu_order/id order locally.
		expect(upserted[0]?.[0].map(({ wooProductId }) => wooProductId)).toEqual(
			Array.from({ length: 40 }, (_, index) => 900 - index)
		);
	});

	it('populates the Leg-3 manifest from _rxdb_digest and strips it from the stored payload', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
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
			{ id: '321', wooId: 321, objectType: 'product', digest: '9223372036854775810' },
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

	it('merges exact SKU matches into product search task results', async () => {
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
			return response([]);
		});
		const schedulerFetcher = createProductsSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(
			productTask({
				id: 'products:search:KEY-101:windowed',
				queryKey: 'products:search:KEY-101',
			})
		);

		expect(fetcher).toHaveBeenNthCalledWith(
			1,
			'http://wcpos.local/wp-json/wcpos/v2/products?search=KEY-101&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/products?sku=KEY-101&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ id: uuidFor(101), wooProductId: 101 }),
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
			expect.objectContaining({ id: uuidFor(101), wooProductId: 101 }),
			expect.objectContaining({ id: uuidFor(201), wooProductId: 201 }),
		]);
	});

	it('withholds lane completion when cross-leg dedupe overflows the persisted window', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
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
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
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
			'http://wcpos.local/wp-json/wcpos/v2/products?search=100%25+cotton&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			'http://wcpos.local/wp-json/wcpos/v2/products?sku=100%25+cotton&per_page=25&page=1&orderby=id&order=desc&status=publish'
		);
	});

	it('fetches targeted product tasks through Woo REST include and records complete coverage', async () => {
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
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
				ids: ['woo-product:321', 'woo-product:654'],
				wooIds: [321, 654],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/products?include=321%2C654&per_page=2&orderby=include'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ id: uuidFor(321), wooProductId: 321 }),
			expect.objectContaining({ id: uuidFor(654), wooProductId: 654 }),
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
				ids: ['woo-product:321'],
				wooIds: [321],
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
				id: uuidFor(321),
				wooProductId: 321,
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

	it('reads the numeric server ids from task.wooIds, decoupled from the document-key encoding', async () => {
		// ids are deliberately opaque (a uuid + garbage): the document keys are never
		// parsed — wooIds is the only channel for the numeric server ids.
		const repository = {
			upsertMany: vi.fn(async () => undefined),
			removeMany: vi.fn(async () => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
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
				wooIds: [321, 654],
				ids: ['8e29c1a4-3b2d-4f6a-9c0e-1d2f3a4b5c6d', 'not-a-woo-product-key'],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/products?include=321%2C654&per_page=2&orderby=include'
		);
	});

	it('fails a targeted product task that is missing its wooIds channel (contract error, no reverse-parse)', async () => {
		// The `/^woo-product:(\d+)$/` reverse-parse scaffolding is deleted: a targeted task
		// without wooIds is a seeder contract violation, surfaced — never silently parsed.
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
					ids: ['woo-product:321', 'woo-product:654'],
					limit: 2,
					mode: 'on-demand',
				})
			)
		).rejects.toThrow(
			'Targeted product scheduler task is missing its wooIds channel: products:ids:321,654:on-demand'
		);
		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.upsertMany).not.toHaveBeenCalled();
	});
});

describe('coverageRecordId', () => {
	const doc = (over: Partial<ProductDocument>): ProductDocument => ({
		id: 'woo-product:1',
		wooProductId: 1,
		payload: {} as ProductDocument['payload'],
		sync: {} as ProductDocument['sync'],
		local: { dirty: false, pendingMutationIds: [] },
		...over,
	});

	it('keys product coverage by the stable wooId, decoupled from the storage id (uuid-ready)', () => {
		// Simulate a post-emit-flip document: uuid STORAGE key, numeric wooProductId retained.
		// Coverage must use the wooId-key so the deep-link lookup (woo-product:<wooId>) matches.
		const result = coverageRecordId(
			doc({ id: '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d', wooProductId: 321 })
		);
		expect(result).toBe('woo-product:321'); // the wooId-key, NOT the uuid storage id
	});

	it('falls back to the storage id for a born-local product with no wooProductId', () => {
		expect(coverageRecordId(doc({ id: 'local-keyed', wooProductId: null }))).toBe('local-keyed');
	});
});
