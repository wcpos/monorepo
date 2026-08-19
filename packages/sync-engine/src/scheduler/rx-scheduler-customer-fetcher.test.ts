// @vitest-environment node
import { describe, expect, it, type Mock, vi } from 'vitest';

import { remoteId } from '../testing';
import { createCustomerSchedulerFetcher } from './rx-scheduler-customer-fetcher';

import type { FetchTask } from './replication-policy';
import type { LocalCustomerDocument } from '../collections/customer-schema';

function customerTask(overrides: Partial<FetchTask> = {}): FetchTask {
	return {
		id: 'customers:search:alex:windowed',
		requirementId: 'customers.search.alex',
		collection: 'customers',
		queryKey: 'customers:search=alex:limit=25',
		limit: 25,
		priority: 800,
		mode: 'windowed',
		...overrides,
	};
}

function response(payload: unknown[], headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json', ...headers },
	});
}

/** A browse-window task for `limit` rows in the given wire sort (default: the bare id-asc key). */
function browseTask(limit: number, sort?: { orderby: string; order: string }): FetchTask {
	const queryKey = sort
		? `customers:browse-window:limit=${limit}:orderby=${sort.orderby}:order=${sort.order}`
		: `customers:browse-window:limit=${limit}`;
	return {
		id: `${queryKey}:windowed`,
		requirementId: `customers.browse-window.limit.${limit}`,
		collection: 'customers',
		queryKey,
		limit,
		priority: 500,
		mode: 'windowed',
	};
}

const customerPayload = (id: number) => ({
	id,
	email: `customer-${id}@example.test`,
	date_modified_gmt: '2026-08-06T10:00:00',
	meta_data: uuidMeta(id),
});

// Deterministic server-stamped uuid per Woo customer id (P0-1: every pulled customer arrives
// carrying its _woocommerce_pos_uuid, re-injected by the catalog-proxy stamp_proxy_customers).
const uuidFor = (id: number) => `5b8e1a3c-2f4d-4a6b-9c8e-${String(id).padStart(12, '0')}`;
const uuidMeta = (id: number) => [{ key: '_woocommerce_pos_uuid', value: uuidFor(id) }];

describe('createCustomerSchedulerFetcher', () => {
	it('fetches targeted customer tasks through Woo REST include and stores customer documents', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 12,
					email: 'ada@example.test',
					date_modified_gmt: '2026-05-28T10:00:00',
					meta_data: uuidMeta(12),
				},
				{
					id: 34,
					email: 'grace@example.test',
					date_modified_gmt: '2026-05-28T10:05:00',
					meta_data: uuidMeta(34),
				},
			])
		);
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(
			customerTask({
				id: 'customers:ids:12,34:on-demand',
				requirementId: 'customers.profile.lookup',
				queryKey: 'customers:ids:12,34',
				documentIds: ['woo-customer:12', 'woo-customer:34'],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/customers?include=12%2C34&per_page=2&orderby=include'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				uuid: uuidFor(12),
				remoteId: remoteId(12),
				payload: expect.objectContaining({ email: 'ada@example.test' }),
				sync: expect.objectContaining({
					revision: '2026-05-28T10:00:00',
					source: 'woo-rest',
					partial: false,
				}),
			}),
			expect.objectContaining({
				uuid: uuidFor(34),
				remoteId: remoteId(34),
				payload: expect.objectContaining({ email: 'grace@example.test' }),
				sync: expect.objectContaining({
					revision: '2026-05-28T10:05:00',
					source: 'woo-rest',
					partial: false,
				}),
			}),
		]);
		expect(result).toEqual({
			taskId: 'customers:ids:12,34:on-demand',
			documentCount: 2,
			requestCount: 1,
			completed: true,
		});
	});

	it('feeds the customer manifest sink the digests of a targeted pull, stripped from the stored payload', async () => {
		// Leg-3 (ADR 0015): the customer existence manifest is populated by the INGEST SITE from
		// each record's materialization envelope (ADR 0028 rider). A lane that stops feeding the
		// sink starves the prune gate with no error anywhere — the #1340 failure class.
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const manifestSink = vi.fn(async (_rows: unknown[]) => undefined);
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			manifestSink,
			fetcher: vi.fn(async () =>
				response([
					{ id: 12, email: 'ada@example.test', meta_data: uuidMeta(12), _rxdb_digest: 'd12' },
					{ id: 34, email: 'grace@example.test', meta_data: uuidMeta(34) }, // no digest
				])
			),
		});

		await schedulerFetcher(
			customerTask({
				id: 'customers:ids:12,34:on-demand',
				queryKey: 'customers:ids:12,34',
				documentIds: ['woo-customer:12', 'woo-customer:34'],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(manifestSink).toHaveBeenCalledWith([
			{ remoteId: '12', wooId: 12, objectType: 'customer', digest: 'd12' },
		]);
		const stored = repository.upsertMany.mock.calls[0]![0];
		expect(stored[0]!.payload).not.toHaveProperty('_rxdb_digest');
	});

	it('stores the existing default customer target without issuing an invalid Woo include request', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			nowMs: () => 11_000,
			fetcher,
		});

		const result = await schedulerFetcher(
			customerTask({
				id: 'customers:ids:default:on-demand',
				requirementId: 'customers.default',
				queryKey: 'customers:ids:default',
				documentIds: ['customer:default'],
				limit: 1,
				mode: 'on-demand',
			})
		);

		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				uuid: 'customer:default',
				remoteId: null,
				payload: {},
				sync: expect.objectContaining({ revision: '', source: 'woo-rest', partial: true }),
			}),
		]);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'customers',
			queryKey: 'customers:ids:default',
			records: [{ id: 'customer:default' }],
			complete: true,
			nowMs: 11_000,
			freshForMs: 300_000,
		});
		expect(result).toEqual({
			taskId: 'customers:ids:default:on-demand',
			documentCount: 1,
			requestCount: 0,
			completed: true,
		});
	});

	it('fetches customer search lanes and records complete coverage only when Woo returns fewer rows than requested', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 56,
					email: 'alex@example.test',
					date_modified_gmt: '2026-05-28T11:00:00',
					meta_data: uuidMeta(56),
				},
			])
		);
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			coverageFreshForMs: 120_000,
			nowMs: () => 9_000,
			fetcher,
		});

		const result = await schedulerFetcher(customerTask({ limit: 25 }));

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wcpos/v2/customers?search=alex&per_page=25&page=1&orderby=id&order=desc'
		);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'customers',
			queryKey: 'customers:search=alex:limit=25',
			records: [{ id: 'woo-customer:56' }],
			complete: true,
			nowMs: 9_000,
			freshForMs: 120_000,
		});
		expect(result).toEqual({
			taskId: 'customers:search:alex:windowed',
			documentCount: 1,
			requestCount: 1,
			completed: true,
		});
	});

	it('rejects customer search tasks whose queryKey limit does not match the task limit', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const fetcher = vi.fn(async () =>
			response([
				{
					id: 56,
					email: 'alex@example.test',
					date_modified_gmt: '2026-05-28T11:00:00',
					meta_data: uuidMeta(56),
				},
			])
		);
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		await expect(
			schedulerFetcher(customerTask({ queryKey: 'customers:search=alex:limit=10', limit: 25 }))
		).rejects.toThrow(
			'Customer scheduler task limit does not match queryKey limit: customers:search=alex:limit=10'
		);
		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.upsertMany).not.toHaveBeenCalled();
	});

	it('fetches enough customer search pages to satisfy a task limit above the Woo page cap', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: index + 1,
			email: `page-one-${index}@example.test`,
			date_modified_gmt: '2026-05-28T11:00:00',
			meta_data: uuidMeta(index + 1),
		}));
		const secondPage = Array.from({ length: 100 }, (_, index) => ({
			id: index + 101,
			email: `page-two-${index}@example.test`,
			date_modified_gmt: '2026-05-28T11:05:00',
			meta_data: uuidMeta(index + 101),
		}));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response(firstPage))
			.mockResolvedValueOnce(response(secondPage));
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			fetcher,
		});

		const result = await schedulerFetcher(
			customerTask({ limit: 150, queryKey: 'customers:search=alex:limit=150' })
		);

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wcpos/v2/customers?search=alex&per_page=100&page=1&orderby=id&order=desc',
			'http://wcpos.local/wp-json/wcpos/v2/customers?search=alex&per_page=100&page=2&orderby=id&order=desc',
		]);
		expect(repository.upsertMany).toHaveBeenCalledTimes(2);
		expect(repository.upsertMany.mock.calls[0]?.[0]).toHaveLength(100);
		expect(repository.upsertMany.mock.calls[1]?.[0]).toHaveLength(50);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				records: expect.arrayContaining([{ id: 'woo-customer:150' }]),
				complete: false,
			})
		);
		expect(result).toEqual({
			taskId: 'customers:search:alex:windowed',
			documentCount: 150,
			requestCount: 2,
			completed: true,
		});
	});

	it('does not mark a search lane complete when the final fetched page is short but some returned rows were truncated by the task limit', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: index + 1,
			email: `page-one-${index}@example.test`,
			date_modified_gmt: '2026-05-28T11:00:00',
			meta_data: uuidMeta(index + 1),
		}));
		const secondPage = Array.from({ length: 75 }, (_, index) => ({
			id: index + 101,
			email: `page-two-${index}@example.test`,
			date_modified_gmt: '2026-05-28T11:05:00',
			meta_data: uuidMeta(index + 101),
		}));
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response(firstPage))
			.mockResolvedValueOnce(response(secondPage));
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			coverageRepository,
			nowMs: () => 10_000,
			fetcher,
		});

		const result = await schedulerFetcher(
			customerTask({ limit: 150, queryKey: 'customers:search=alex:limit=150' })
		);

		expect(repository.upsertMany.mock.calls[1]?.[0]).toHaveLength(50);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'customers',
			queryKey: 'customers:search=alex:limit=150',
			records: Array.from({ length: 150 }, (_, index) => ({ id: `woo-customer:${index + 1}` })),
			complete: false,
			nowMs: 10_000,
			freshForMs: 300_000,
		});
		expect(result).toEqual({
			taskId: 'customers:search:alex:windowed',
			documentCount: 150,
			requestCount: 2,
			completed: true,
		});
	});

	// #951 — the sorted customers browse window.
	describe('browse window', () => {
		const browseFetcher = (
			fetcher: Mock<(url: string) => Promise<Response>>,
			overrides: Record<string, unknown> = {}
		) => {
			const repository = {
				upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
			};
			const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
			const cacheQueryTotals = vi.fn(async () => undefined);
			const schedulerFetcher = createCustomerSchedulerFetcher({
				baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
				repository,
				fetcher,
				coverageRepository,
				cacheQueryTotals,
				nowMs: () => 10_000,
				...overrides,
			});
			return { repository, coverageRepository, cacheQueryTotals, schedulerFetcher };
		};

		// #1028 follow-on: the five WCPOS plugin sorts (#1488/#1500) travel to the wire exactly
		// like the wc/v3-native ones — the fetcher re-parses the queryKey and forwards `orderby`
		// verbatim, so no per-sort branch is needed and none should creep in.
		it.each(['first_name', 'last_name', 'email', 'username', 'role'] as const)(
			'forwards the plugin-proxied sort %s verbatim to the server',
			async (orderby) => {
				const fetcher = vi.fn(async (_url: string) =>
					response(
						Array.from({ length: 5 }, (_, index) => customerPayload(index + 1)),
						{
							'X-WP-Total': '5',
							'X-WP-TotalPages': '1',
						}
					)
				);
				const kit = browseFetcher(fetcher);

				await kit.schedulerFetcher(browseTask(100, { orderby, order: 'desc' }));

				const url = new URL(fetcher.mock.calls[0]![0]);
				expect(url.searchParams.get('orderby')).toBe(orderby);
				expect(url.searchParams.get('order')).toBe('desc');
				expect(url.searchParams.get('role')).toBe('all');
			}
		);

		it('feeds the customer manifest sink one row per deduplicated window row', async () => {
			// The browse walk is the customer lane with its OWN upsert (it dedupes boundary rows
			// itself), so it must feed the manifest sink itself too — see the targeted-lane test.
			const manifestSink = vi.fn(async (_rows: unknown[]) => undefined);
			const fetcher = vi.fn(async (_url: string) =>
				response(
					[1, 2, 2].map((id) => ({ ...customerPayload(id), _rxdb_digest: `d${id}` })),
					{ 'X-WP-Total': '3', 'X-WP-TotalPages': '1' }
				)
			);
			const kit = browseFetcher(fetcher, { manifestSink });

			await kit.schedulerFetcher(browseTask(100));

			expect(manifestSink).toHaveBeenCalledWith([
				{ remoteId: '1', wooId: 1, objectType: 'customer', digest: 'd1' },
				{ remoteId: '2', wooId: 2, objectType: 'customer', digest: 'd2' },
			]);
		});

		it('asks the SERVER for the sorted window, with role=all (#1379/#850)', async () => {
			const fetcher = vi.fn(async (_url: string) =>
				response(
					Array.from({ length: 25 }, (_, index) => customerPayload(index + 1)),
					{ 'X-WP-Total': '4200', 'X-WP-TotalPages': '168' }
				)
			);
			const kit = browseFetcher(fetcher);

			const result = await kit.schedulerFetcher(
				browseTask(25, { orderby: 'registered_date', order: 'desc' })
			);

			expect(fetcher).toHaveBeenCalledTimes(1);
			const url = new URL(fetcher.mock.calls[0]![0]);
			expect(url.pathname).toBe('/wp-json/wcpos/v2/customers');
			expect(url.searchParams.get('orderby')).toBe('registered_date');
			expect(url.searchParams.get('order')).toBe('desc');
			expect(url.searchParams.get('role')).toBe('all');
			expect(url.searchParams.get('per_page')).toBe('25');
			expect(url.searchParams.get('page')).toBe('1');
			expect(kit.repository.upsertMany.mock.calls[0]?.[0]).toHaveLength(25);
			expect(result).toMatchObject({ documentCount: 25, requestCount: 1, completed: true });
		});

		it('reports the SERVER total for the sorted view, not the resident count (#894/#945)', async () => {
			const fetcher = vi.fn(async (_url: string) =>
				response(
					Array.from({ length: 100 }, (_, index) => customerPayload(index + 1)),
					{ 'X-WP-Total': '4200', 'X-WP-TotalPages': '42' }
				)
			);
			const kit = browseFetcher(fetcher);

			await kit.schedulerFetcher(browseTask(100));

			expect(kit.cacheQueryTotals).toHaveBeenCalledWith({
				queryKeys: ['customers:browse-window:limit=100', 'census:customers'],
				totalMatchingRecords: 4_200,
			});
			// 100 of 4,200 is NOT a complete lane — recording it as one is the false-complete bug.
			expect(kit.coverageRepository.recordQueryResult).toHaveBeenCalledWith(
				expect.objectContaining({ complete: false })
			);
		});

		it('completes the lane when the server runs out inside the window', async () => {
			const fetcher = vi.fn(async (_url: string) =>
				response(
					Array.from({ length: 7 }, (_, index) => customerPayload(index + 1)),
					{ 'X-WP-Total': '7', 'X-WP-TotalPages': '1' }
				)
			);
			const kit = browseFetcher(fetcher);

			await kit.schedulerFetcher(browseTask(100));

			expect(kit.coverageRepository.recordQueryResult).toHaveBeenCalledWith(
				expect.objectContaining({ complete: true })
			);
		});

		it('walks the window in Performance-dial pages, never one heavy request (#908)', async () => {
			let served = 0;
			const fetcher = vi.fn(async (_url: string) => {
				const page = Array.from({ length: 25 }, (_, index) => customerPayload(served + index + 1));
				served += 25;
				return response(page, { 'X-WP-Total': '4200', 'X-WP-TotalPages': '168' });
			});
			const kit = browseFetcher(fetcher, { pullBatchSize: () => 25 });

			const result = await kit.schedulerFetcher(browseTask(100));

			expect(result).toMatchObject({ documentCount: 100, requestCount: 4 });
			for (const call of fetcher.mock.calls) {
				expect(new URL(call[0]).searchParams.get('per_page')).toBe('25');
			}
		});

		it('stops at the advertised last page instead of asking for one past it', async () => {
			const fetcher = vi.fn(async (_url: string) =>
				response(
					Array.from({ length: 50 }, (_, index) => customerPayload(index + 1)),
					{ 'X-WP-Total': '50', 'X-WP-TotalPages': '1' }
				)
			);
			const kit = browseFetcher(fetcher, { pullBatchSize: () => 50 });

			await kit.schedulerFetcher(browseTask(200));

			expect(fetcher).toHaveBeenCalledTimes(1);
		});

		// A proxy (or a browser without `Access-Control-Expose-Headers`) can hide X-WP-Total.
		// `Number(null)` is 0, so a naive read caches a FRESH ZERO and the footer reports 0 for
		// five minutes while rows are on screen — worse than admitting the total is unknown.
		it('caches no total at all when the response exposes no X-WP-Total', async () => {
			const fetcher = vi.fn(async (_url: string) =>
				response(Array.from({ length: 7 }, (_, index) => customerPayload(index + 1)))
			);
			const kit = browseFetcher(fetcher);

			const result = await kit.schedulerFetcher(browseTask(100));

			expect(result).toMatchObject({ documentCount: 7 });
			expect(kit.cacheQueryTotals).not.toHaveBeenCalled();
		});

		// Offset pagination is not stable: a customer created between page requests shifts every
		// later page by one, so a boundary row can repeat. RxDB's bulkUpsert throws COL22 on
		// duplicate primary keys in one call, which would fail the WHOLE browse after several
		// successful requests.
		it('deduplicates repeated boundary rows so a mid-walk insert cannot fail the browse', async () => {
			let page = 0;
			const fetcher = vi.fn(async (_url: string) => {
				page += 1;
				// Page 2 repeats customer 50 — the shape an insert between requests produces.
				const ids =
					page === 1
						? Array.from({ length: 50 }, (_, index) => index + 1)
						: [50, ...Array.from({ length: 49 }, (_, index) => index + 51)];
				return response(ids.map(customerPayload), {
					'X-WP-Total': '4200',
					'X-WP-TotalPages': '84',
				});
			});
			const kit = browseFetcher(fetcher, { pullBatchSize: () => 50 });

			await kit.schedulerFetcher(browseTask(100));

			const upserted = kit.repository.upsertMany.mock.calls[0]?.[0] ?? [];
			const ids = upserted.map((document) => document.uuid);
			expect(new Set(ids).size).toBe(ids.length);
		});

		it('leaves the targeted and search lanes untouched', async () => {
			const fetcher = vi.fn(async (_url: string) => response([customerPayload(12)]));
			const kit = browseFetcher(fetcher);

			await kit.schedulerFetcher(
				customerTask({ queryKey: 'customers:search=alex:limit=25', limit: 25 })
			);

			const url = new URL(fetcher.mock.calls[0]![0]);
			expect(url.searchParams.get('search')).toBe('alex');
			expect(url.searchParams.get('role')).toBeNull();
			expect(kit.cacheQueryTotals).not.toHaveBeenCalled();
		});
	});
});
