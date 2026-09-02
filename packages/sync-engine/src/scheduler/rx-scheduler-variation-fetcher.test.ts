// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { remoteId } from '../testing';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import { createVariationsSchedulerFetcher } from './rx-scheduler-variation-fetcher';

import type { FetchTask } from './replication-policy';
import type { StoredVariationDocument } from '../collections/variation-schema';

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
	it('issues exactly one request per page with search= and never sku=', async () => {
		const repo = repository();
		const fetcher = vi.fn(async (url: string) => {
			const params = new URL(url).searchParams;
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
		]);
		expect(fetcher.mock.calls.every(([url]) => !new URL(url).searchParams.has('sku'))).toBe(true);
		expect(result).toEqual({
			taskId: 'variations:search:keyboard:windowed',
			documentCount: 3,
			requestCount: 2,
			completed: true,
		});
	});

	it('paginates beyond the REST page cap to fulfill the task limit', async () => {
		const repo = repository();
		const fetcher = vi.fn(async (url: string) => {
			const params = new URL(url).searchParams;
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
		]);
		expect(repo.upsertMany.mock.calls[0]?.[0]).toHaveLength(WOO_REST_MAX_PER_PAGE + 1);
		expect(result).toMatchObject({ documentCount: WOO_REST_MAX_PER_PAGE + 1, completed: true });
	});

	it('records complete empty coverage without a request for a whitespace-only term', async () => {
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fetcher = vi.fn(async (_url: string) => response([]));
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repository(),
			coverageRepository,
			coverageFreshForMs: 60_000,
			nowMs: () => 5_000,
			fetcher,
		});

		const result = await schedulerFetcher(
			variationTask({
				id: 'variations:search:%20%20:windowed',
				queryKey: 'variations:search:%20%20',
			})
		);

		expect(fetcher).not.toHaveBeenCalled();
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
			collection: 'variations',
			queryKey: 'variations:search:%20%20',
			records: [],
			complete: true,
			nowMs: 5_000,
			freshForMs: 60_000,
		});
		expect(result).toEqual({
			taskId: 'variations:search:%20%20:windowed',
			documentCount: 0,
			requestCount: 0,
			completed: true,
		});
	});

	it('records incomplete coverage when a leg fills the task limit without a short page', async () => {
		const coverageRepository = {
			recordQueryResult: vi.fn(async () => undefined),
		};
		const fetcher = vi.fn(async () => response([wrapper(2), wrapper(1)]));
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
		const repo = {
			upsertMany: vi.fn(async (documents: StoredVariationDocument[]) => documents.slice(0, 1)),
		};
		const manifestSink = vi.fn(async () => undefined);
		const fetcher = vi.fn(async () => {
			return response(
				[
					{
						...wrapper(7, 3, { id: 999, parent_id: 999, price: '12.50' }),
						_rxdb_digest: 'digest-7',
					},
					{ ...wrapper(8, 3), _rxdb_digest: 'digest-8' },
				],
				{ total: 2, extra: 'ignored' }
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
			{ remoteId: '7', wooId: 7, objectType: 'variation', digest: 'digest-7' },
		]);
	});

	it.each([
		variationTask({ documentIds: ['variation:1'] }),
		variationTask({ queryKey: 'variations:all' }),
	])('rejects non-search task shapes loudly', async (task) => {
		const schedulerFetcher = createVariationsSchedulerFetcher({
			baseUrl: BASE_URL,
			repository: repository(),
			fetcher: vi.fn(async () => response([])),
		});

		await expect(schedulerFetcher(task)).rejects.toThrow(/variation scheduler task/i);
	});
});
