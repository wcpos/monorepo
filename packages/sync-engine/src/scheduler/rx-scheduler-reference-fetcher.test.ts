// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	CATEGORY_REFERENCE_CONFIG,
	createReferenceCollectionFetcher,
} from './rx-scheduler-reference-fetcher';

import type { FetchTask } from './replication-policy';
import type { WooReferencePayload } from '../collections/reference-collection-schema';

function categoryTask(overrides: Partial<FetchTask> = {}): FetchTask {
	return {
		id: 'categories:all:greedy',
		requirementId: 'categories.all',
		collection: 'categories',
		queryKey: 'categories:all',
		limit: 2,
		priority: 100,
		mode: 'greedy',
		...overrides,
	};
}

function response(payloads: WooReferencePayload[]): Response {
	return new Response(JSON.stringify(payloads), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

// Deterministic server-stamped uuid per Woo term id (P0-1: pulled terms arrive carrying their
// _woocommerce_pos_uuid, re-injected by the catalog-proxy stamp_proxy_terms).
const uuidFor = (id: number) => `5b8e1a3c-2f4d-4a6b-9c8e-${String(id).padStart(12, '0')}`;
const cat = (id: number): WooReferencePayload => ({
	id,
	name: `Category ${id}`,
	meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(id) }],
});

describe('createReferenceCollectionFetcher set-difference deletion', () => {
	it('prunes server-sourced local docs absent from the complete fetched set on the terminal page', async () => {
		// 1 doc < perPage(2) ⇒ this single page is the complete authoritative set.
		const fetcher = vi.fn(async () => response([cat(1)]));
		const pruneServerSourcedAbsent = vi.fn(async () => ['woo-category:99']);
		const repository = { upsertMany: vi.fn(async () => undefined), pruneServerSourcedAbsent };
		const schedulerFetcher = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(categoryTask());

		expect(result.completed).toBe(true);
		expect(pruneServerSourcedAbsent).toHaveBeenCalledTimes(1);
		// Post-flip the prune kept-set is the STORAGE keys (uuids) — it must match the stored doc.id,
		// NOT the Woo-id-space coverage key, or every server-sourced term gets pruned every refresh.
		expect(pruneServerSourcedAbsent).toHaveBeenCalledWith([uuidFor(1)]);
		expect(result.prunedCount).toBe(1);
	});

	it('does NOT prune on a non-terminal page (more pages remain)', async () => {
		// A full page (2 == perPage) ⇒ not complete ⇒ pruning here would wrongly
		// tombstone docs that simply haven't been fetched yet.
		const fetcher = vi.fn(async () => response([cat(1), cat(2)]));
		const pruneServerSourcedAbsent = vi.fn(async () => []);
		const repository = { upsertMany: vi.fn(async () => undefined), pruneServerSourcedAbsent };
		const schedulerFetcher = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'http://x/v1',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(categoryTask());

		expect(result.completed).toBe(false);
		expect(pruneServerSourcedAbsent).not.toHaveBeenCalled();
		expect(result.prunedCount).toBe(0);
	});

	it('prunes against the ids accumulated across ALL pages, not just the terminal one', async () => {
		// Page 1: full (2) ⇒ more pages. Page 2: short (1) ⇒ terminal.
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(response([cat(1), cat(2)]))
			.mockResolvedValueOnce(response([cat(3)]));
		const pruneServerSourcedAbsent = vi.fn(async () => []);
		const repository = { upsertMany: vi.fn(async () => undefined), pruneServerSourcedAbsent };
		const schedulerFetcher = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'http://x/v1',
			repository,
			fetcher,
		});

		const first = await schedulerFetcher(categoryTask());
		const second = await schedulerFetcher(categoryTask());

		expect(first.completed).toBe(false);
		expect(second.completed).toBe(true);
		expect(pruneServerSourcedAbsent).toHaveBeenCalledTimes(1);
		expect(pruneServerSourcedAbsent).toHaveBeenCalledWith([uuidFor(1), uuidFor(2), uuidFor(3)]);
	});

	it('skips the prune when the refresh was aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const fetcher = vi.fn(async () => response([cat(1)]));
		const pruneServerSourcedAbsent = vi.fn(async () => []);
		const repository = { upsertMany: vi.fn(async () => undefined), pruneServerSourcedAbsent };
		const schedulerFetcher = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'http://x/v1',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(categoryTask(), { signal: controller.signal });

		expect(result.completed).toBe(true);
		expect(pruneServerSourcedAbsent).not.toHaveBeenCalled();
		expect(result.prunedCount).toBe(0);
	});

	it('is a no-op (no prune) when the repository does not implement pruneServerSourcedAbsent', async () => {
		const fetcher = vi.fn(async () => response([cat(1)]));
		const repository = { upsertMany: vi.fn(async () => undefined) };
		const schedulerFetcher = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'http://x/v1',
			repository,
			fetcher,
		});

		const result = await schedulerFetcher(categoryTask());

		expect(result.completed).toBe(true);
		expect(result.prunedCount).toBe(0);
	});

	it('keeps the three id-spaces distinct: storage=uuid, coverage=woo-prefix, prune=uuid (divergence regression)', async () => {
		// The catastrophic naive-flip bug is conflating coverage and prune into one array. This pins
		// all three: the stored doc keys by the uuid; coverage records the Woo-id-space key; the prune
		// kept-set is the uuid storage key (so it matches stored doc.id and never mass-deletes).
		const fetcher = vi.fn(async () => response([cat(1)]));
		const pruneServerSourcedAbsent = vi.fn(async () => []);
		const repository = { upsertMany: vi.fn(async () => undefined), pruneServerSourcedAbsent };
		const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
		const schedulerFetcher = createReferenceCollectionFetcher(CATEGORY_REFERENCE_CONFIG, {
			baseUrl: 'http://x/v1',
			repository,
			coverageRepository,
			fetcher,
		});

		await schedulerFetcher(categoryTask());

		expect(repository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({ id: uuidFor(1), wooId: 1 }),
		]);
		expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: 'categories',
				records: [{ id: 'woo-category:1' }],
			})
		);
		expect(pruneServerSourcedAbsent).toHaveBeenCalledWith([uuidFor(1)]);
	});
});
