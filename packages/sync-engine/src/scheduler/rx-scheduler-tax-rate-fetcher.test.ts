// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTaxRateSchedulerFetcher } from './rx-scheduler-tax-rate-fetcher';

import type { FetchTask } from './replication-policy';
import type { LocalTaxRateDocument } from '../collections/tax-rate-schema';

function taxTask(overrides: Partial<FetchTask> = {}): FetchTask {
	return {
		id: 'taxRates:all:greedy',
		requirementId: 'taxRates.startup',
		collection: 'taxRates',
		queryKey: 'taxRates:all',
		limit: 2,
		priority: 1000,
		mode: 'greedy',
		...overrides,
	};
}

function response(payload: unknown[]): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

describe('createTaxRateSchedulerFetcher', () => {
	it('fetches the greedy tax-rate startup lane page-by-page and records complete coverage after exhaustion', async () => {
		const repository = {
			upsertMany: vi.fn(async (_documents: LocalTaxRateDocument[]) => undefined),
		};
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				response([
					{ id: 1, country: 'US', rate: '8.5' },
					{ id: 2, country: 'US', rate: '4.0' },
				])
			)
			.mockResolvedValueOnce(response([{ id: 3, country: 'ES', rate: '21.0' }]))
			.mockResolvedValueOnce(response([{ id: 1, country: 'US', rate: '8.6' }]));
		const schedulerFetcher = createTaxRateSchedulerFetcher({
			baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
			repository,
			coverageRepository,
			coverageFreshForMs: 300_000,
			nowMs: () => 10_000,
			fetcher,
		});

		const first = await schedulerFetcher(taxTask());
		const second = await schedulerFetcher(taxTask());
		const nextRun = await schedulerFetcher(taxTask());

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/taxes?per_page=2&page=1&orderby=id&order=asc',
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/taxes?per_page=2&page=2&orderby=id&order=asc',
			'http://wcpos.local/wp-json/wc-rxdb-sync/v1/taxes?per_page=2&page=1&orderby=id&order=asc',
		]);
		expect(repository.upsertMany).toHaveBeenCalledTimes(3);
		expect(repository.upsertMany.mock.calls[0]?.[0]).toEqual([
			expect.objectContaining({
				id: 'woo-tax-rate:1',
				wooTaxRateId: 1,
				sync: expect.objectContaining({ source: 'woo-rest', partial: false }),
			}),
			expect.objectContaining({
				id: 'woo-tax-rate:2',
				wooTaxRateId: 2,
				sync: expect.objectContaining({ source: 'woo-rest', partial: false }),
			}),
		]);
		expect(repository.upsertMany.mock.calls[1]?.[0]).toEqual([
			expect.objectContaining({ id: 'woo-tax-rate:3', wooTaxRateId: 3 }),
		]);
		expect(repository.upsertMany.mock.calls[2]?.[0]).toEqual([
			expect.objectContaining({ id: 'woo-tax-rate:1', wooTaxRateId: 1 }),
		]);
		expect(coverageRepository.recordQueryResult).toHaveBeenNthCalledWith(2, {
			collection: 'taxRates',
			queryKey: 'taxRates:all',
			records: [{ id: 'woo-tax-rate:1' }, { id: 'woo-tax-rate:2' }, { id: 'woo-tax-rate:3' }],
			complete: true,
			nowMs: 10_000,
			freshForMs: 300_000,
		});
		expect(coverageRepository.recordQueryResult).toHaveBeenNthCalledWith(3, {
			collection: 'taxRates',
			queryKey: 'taxRates:all',
			records: [{ id: 'woo-tax-rate:1' }],
			complete: true,
			nowMs: 10_000,
			freshForMs: 300_000,
		});
		expect(first).toEqual({
			taskId: 'taxRates:all:greedy',
			documentCount: 2,
			requestCount: 1,
			completed: false,
		});
		expect(second).toEqual({
			taskId: 'taxRates:all:greedy',
			documentCount: 1,
			requestCount: 1,
			completed: true,
		});
		expect(nextRun).toEqual({
			taskId: 'taxRates:all:greedy',
			documentCount: 1,
			requestCount: 1,
			completed: true,
		});
	});
});
