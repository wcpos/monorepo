// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { remoteId } from '../testing';

import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import { createVariationsSchedulerFetcher } from './rx-scheduler-variation-fetcher';

import type { FetchTask } from './replication-policy';

const BASE_URL = 'http://wcpos.local/wp-json/wcpos/v2';
const uuidFor = (n: number): string => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const posMeta = (n: number) => [{ key: '_woocommerce_pos_uuid', value: uuidFor(n) }];

function variationTask(overrides: Partial<FetchTask> = {}): FetchTask {
	return {
		id: 'variations:search:keyboard:windowed',
		requirementId: 'variations.search.keyboard',
		collection: 'variations',
		queryKey: 'variations:search:keyboard',
		limit: 25,
		priority: 900,
		mode: 'windowed',
		...overrides,
	};
}

function wrapper(id: number, parentId = 10, payload: Record<string, unknown> = {}) {
	return {
		id,
		parent_id: parentId,
		payload: {
			id,
			date_modified_gmt: '2026-08-01T10:00:00',
			meta_data: posMeta(id),
			...payload,
		},
	};
}

function response(documents: unknown[], meta: Record<string, unknown> = {}): Response {
	return Response.json({
		documents,
		meta: { total: documents.length, page: 1, per_page: 10, ...meta },
	});
}

function repository() {
	return { upsertMany: vi.fn(async (_documents: Record<string, unknown>[]) => undefined) };
}

describe('createVariationsSchedulerFetcher', () => {
	it('walks the search leg in fixed-size pages and sends only the variation search contract params', async () => {
		const repo = repository();
		const fetcher = vi.fn(async (url: string) => {
			const params = new URL(url).searchParams;
			if (params.has('sku')) return response([]);
			return params.get('page') === '1'
				? response([wrapper(3), wrapper(2)])
				: response([wrapper(1)]);
		});
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repo,
			fetcher,
			pullBatchSize: () => 2,
		});

		const result = await schedulerFetcher(variationTask({ limit: 3 }));

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			`${BASE_URL}/variations?search=keyboard&per_page=2&page=1`,
			`${BASE_URL}/variations?search=keyboard&per_page=2&page=2`,
			`${BASE_URL}/variations?sku=keyboard&per_page=2&page=1`,
		]);
		expect(result).toEqual({
			taskId: 'variations:search:keyboard:windowed',
			documentCount: 3,
			requestCount: 3,
			completed: true,
		});
	});

	it('paginates beyond the REST page cap to fulfill the task limit', async () => {
		const repo = repository();
		const fetcher = vi.fn(async (url: string) => {
			const params = new URL(url).searchParams;
			if (params.has('sku')) return response([]);
			const page = Number(params.get('page'));
			const start = (page - 1) * WOO_REST_MAX_PER_PAGE + 1;
			const count = page === 1 ? WOO_REST_MAX_PER_PAGE : 1;
			return response(Array.from({ length: count }, (_, index) => wrapper(start + index)));
		});
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repo,
			fetcher,
		});

		const result = await schedulerFetcher(variationTask({ limit: WOO_REST_MAX_PER_PAGE + 1 }));

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			`${BASE_URL}/variations?search=keyboard&per_page=${WOO_REST_MAX_PER_PAGE}&page=1`,
			`${BASE_URL}/variations?search=keyboard&per_page=${WOO_REST_MAX_PER_PAGE}&page=2`,
			`${BASE_URL}/variations?sku=keyboard&per_page=${WOO_REST_MAX_PER_PAGE}&page=1`,
		]);
		expect(repo.upsertMany.mock.calls[0]?.[0]).toHaveLength(WOO_REST_MAX_PER_PAGE + 1);
		expect(result).toMatchObject({ documentCount: WOO_REST_MAX_PER_PAGE + 1, completed: true });
	});

	it('runs only the exact SKU leg for a two-character search', async () => {
		const fetcher = vi.fn(async (_url: string) => response([]));
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repository(),
			fetcher,
		});

		const result = await schedulerFetcher(
			variationTask({
				id: 'variations:search:42:windowed',
				queryKey: 'variations:search:42',
			})
		);

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			`${BASE_URL}/variations?sku=42&per_page=25&page=1`,
		]);
		expect(result).toMatchObject({ requestCount: 1, completed: true });
	});

	it('dedupes by numeric id with the exact SKU leg winning', async () => {
		const repo = repository();
		const fetcher = vi.fn(async (url: string) =>
			url.includes('sku=')
				? response([wrapper(101, 9, { name: 'Exact SKU', sku: 'KEY-101' })])
				: response([wrapper(101, 9, { name: 'Fuzzy search', sku: 'OTHER' })])
		);
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repo,
			fetcher,
		});

		await schedulerFetcher(
			variationTask({
				id: 'variations:search:KEY-101:windowed',
				queryKey: 'variations:search:KEY-101',
			})
		);

		expect(repo.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				remoteId: remoteId(101),
				parentRemoteId: remoteId(9),
				payload: expect.objectContaining({ name: 'Exact SKU', sku: 'KEY-101' }),
			}),
		]);
	});

	it('records incomplete coverage when a leg fills the task limit without a short page', async () => {
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async (url: string) =>
			url.includes('sku=') ? response([]) : response([wrapper(2), wrapper(1)])
		);
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repository(),
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		const result = await schedulerFetcher(variationTask({ limit: 2 }));

		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'variations',
			queryKey: 'variations:search:keyboard',
			records: [{ id: 'woo-variation:2' }, { id: 'woo-variation:1' }],
			complete: false,
			nowMs: 5_000,
			freshForMs: 60_000,
		});
		expect(result.completed).toBe(false);
	});

	it('tolerates envelope metadata and projects wrapper identity, parent, and digest like targeted pulls', async () => {
		const repo = repository();
		const manifestSink = vi.fn(async () => undefined);
		const fetcher = vi.fn(async (url: string) => {
			if (url.includes('sku=')) return response([]);
			return response(
				[
					{
						...wrapper(7, 3, { id: 999, parent_id: 999, price: '12.50' }),
						_rxdb_digest: 'digest-7',
					},
				],
				{ total: 1, extra: 'ignored' }
			);
		});
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repo,
			fetcher,
			manifestSink,
		});

		await schedulerFetcher(variationTask());

		const stored = repo.upsertMany.mock.calls[0]?.[0]?.[0];
		expect(stored).toMatchObject({
			uuid: uuidFor(7),
			remoteId: remoteId(7),
			parentRemoteId: remoteId(3),
			price: 12.5,
			payload: { id: 7, parent_id: 3 },
		});
		expect(stored?.payload).not.toHaveProperty('_rxdb_digest');
		expect(manifestSink).toHaveBeenCalledWith([
			{ id: '7', wooId: 7, objectType: 'variation', digest: 'digest-7' },
		]);
	});

	it.each([variationTask({ ids: ['variation:1'] }), variationTask({ queryKey: 'variations:all' })])(
		'rejects non-search task shapes loudly',
		async (task) => {
			const schedulerFetcher = createVariationsSchedulerFetcher({
				baseUrl: BASE_URL,
				repository: repository(),
				fetcher: vi.fn(async () => response([])),
			});

			await expect(schedulerFetcher(task)).rejects.toThrow(/variation scheduler task/i);
		}
	);
});
