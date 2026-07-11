// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

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

function response(payload: unknown[]): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

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
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(
			customerTask({
				id: 'customers:ids:12,34:on-demand',
				requirementId: 'customers.profile.lookup',
				queryKey: 'customers:ids:12,34',
				ids: ['woo-customer:12', 'woo-customer:34'],
				limit: 2,
				mode: 'on-demand',
			})
		);

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/customers?include=12%2C34&per_page=2&orderby=include'
		);
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				id: uuidFor(12),
				wooCustomerId: 12,
				payload: expect.objectContaining({ email: 'ada@example.test' }),
				sync: expect.objectContaining({
					revision: '2026-05-28T10:00:00',
					source: 'woo-rest',
					partial: false,
				}),
			}),
			expect.objectContaining({
				id: uuidFor(34),
				wooCustomerId: 34,
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

	it('stores the existing default customer target without issuing an invalid Woo include request', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalCustomerDocument[]) => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async () => response([]));
		const schedulerFetcher = createCustomerSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
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
				ids: ['customer:default'],
				limit: 1,
				mode: 'on-demand',
			})
		);

		expect(fetcher).not.toHaveBeenCalled();
		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				id: 'customer:default',
				wooCustomerId: null,
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
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 120_000,
			nowMs: () => 9_000,
			fetcher,
		});

		const result = await schedulerFetcher(customerTask({ limit: 25 }));

		expect(fetcher).toHaveBeenCalledWith(
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/customers?search=alex&per_page=25&page=1&orderby=id&order=desc'
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
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
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
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			fetcher,
		});

		const result = await schedulerFetcher(
			customerTask({ limit: 150, queryKey: 'customers:search=alex:limit=150' })
		);

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/customers?search=alex&per_page=100&page=1&orderby=id&order=desc',
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/customers?search=alex&per_page=100&page=2&orderby=id&order=desc',
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
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
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
});
