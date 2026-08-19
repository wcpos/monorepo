// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	CATEGORY_REFERENCE_CONFIG,
	createReferenceCollectionFetcher,
} from './rx-scheduler-reference-fetcher';

import type { FetchTask } from './replication-policy';
import type { WooReferencePayload } from '../collections/reference-collection-schema';

const uuidFor = (id: number) => `5b8e1a3c-2f4d-4a6b-9c8e-${String(id).padStart(12, '0')}`;
const cat = (id: number): WooReferencePayload => ({
	id,
	name: `Category ${id}`,
	meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(id) }],
});
const response = (payloads: WooReferencePayload[]): Response => Response.json(payloads);

function task(queryKey = 'categories:all', limit = 2): FetchTask {
	return {
		id: `${queryKey}:greedy`,
		requirementId: 'categories.all',
		collection: 'categories',
		queryKey,
		limit,
		priority: 950,
		mode: 'greedy',
	};
}

function repository() {
	return {
		upsertMany: vi.fn(async () => undefined),
		pruneServerSourcedAbsent: vi.fn(async () => [] as string[]),
		listServerSourcedAbsent: vi.fn(async () => [] as { uuid: string; wooId: number }[]),
		pruneServerSourcedAbsentByUuids: vi.fn(async () => [] as string[]),
	};
}

describe('reference lane sorted greedy fetches', () => {
	it('pins the legacy default query bytes and skips verification', async () => {
		const repo = repository();
		const fetcher = vi.fn(async () => response([cat(1)]));
		const run = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'https://example.test/wp-json/wcpos/v2',
			repository: repo,
			fetcher,
		});

		await run(task());

		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher).toHaveBeenCalledWith(
			'https://example.test/wp-json/wcpos/v2/products/categories?per_page=2&page=1&orderby=id&order=asc'
		);
		expect(repo.listServerSourcedAbsent).not.toHaveBeenCalled();
	});

	it('uses the sorted identity on the wire and starts its independent cursor at page 1', async () => {
		const repo = repository();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response([cat(1), cat(2)]))
			.mockResolvedValueOnce(response([]));
		const run = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'https://example.test/wp-json/wcpos/v2',
			repository: repo,
			fetcher,
		});

		await run(task());
		await run(task('categories:all:orderby=name:order=desc'));

		expect(fetcher.mock.calls[1]?.[0]).toBe(
			'https://example.test/wp-json/wcpos/v2/products/categories?per_page=2&page=1&orderby=name&order=desc'
		);
	});

	it('verifies non-id absences and prunes only ids omitted by the server', async () => {
		const repo = repository();
		repo.listServerSourcedAbsent.mockResolvedValue([
			{ uuid: uuidFor(98), wooId: 98 },
			{ uuid: uuidFor(99), wooId: 99 },
		]);
		repo.pruneServerSourcedAbsentByUuids.mockResolvedValue([uuidFor(98)]);
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response([]))
			.mockResolvedValueOnce(response([cat(99)]));
		const run = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'https://example.test/wp-json/wcpos/v2',
			repository: repo,
			fetcher,
		});

		const result = await run(task('categories:all:orderby=name:order=desc'));

		expect(fetcher.mock.calls[1]?.[0]).toBe(
			'https://example.test/wp-json/wcpos/v2/products/categories?include=98%2C99&per_page=2'
		);
		expect(repo.pruneServerSourcedAbsentByUuids).toHaveBeenCalledWith([uuidFor(98)]);
		expect(result).toMatchObject({ requestCount: 2, prunedCount: 1 });
	});

	it('fails safe when verification throws and emits a warning', async () => {
		const repo = repository();
		repo.listServerSourcedAbsent.mockResolvedValue([{ uuid: uuidFor(98), wooId: 98 }]);
		const diagnostics = vi.fn();
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response([]))
			.mockRejectedValueOnce(new Error('offline'));
		const run = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'https://example.test/wp-json/wcpos/v2',
			repository: repo,
			fetcher,
			diagnostics,
		});

		await expect(run(task('categories:all:orderby=count:order=asc'))).resolves.toMatchObject({
			completed: true,
			prunedCount: 0,
		});
		expect(repo.pruneServerSourcedAbsentByUuids).not.toHaveBeenCalled();
		expect(diagnostics).toHaveBeenCalledWith(
			expect.objectContaining({ level: 'warn', collection: 'categories' })
		);
	});
});
