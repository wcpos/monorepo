// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { ExistenceManifestDocument } from '@wcpos/sync-engine/testing';

import {
	bucketIndexesForMaxWooId,
	partitionActionsByLane,
	reconcileExistence,
	resolveDirtyWooIds,
} from './reconciliation';

import type { ServerDigestEntry } from '../reconcile-bucket-plan';

describe('bucketIndexesForMaxWooId', () => {
	it('covers every id up to the max in fixed-width buckets', () => {
		expect(bucketIndexesForMaxWooId(2500, 1000)).toEqual([0, 1, 2]); // id 2500 lives in bucket 2
		expect(bucketIndexesForMaxWooId(1000, 1000)).toEqual([0, 1]); // id 1000 spills into bucket 1
		expect(bucketIndexesForMaxWooId(1, 1000)).toEqual([0]);
	});

	it('is empty when there are no local ids', () => {
		expect(bucketIndexesForMaxWooId(0, 1000)).toEqual([]);
		expect(bucketIndexesForMaxWooId(-5, 1000)).toEqual([]);
	});
});

describe('partitionActionsByLane', () => {
	it('splits actions into product and variation wooId lists', () => {
		expect(
			partitionActionsByLane([
				{ wooId: 1, objectType: 'product' },
				{ wooId: 2, objectType: 'variation' },
				{ wooId: 3, objectType: 'product' },
			])
		).toEqual({ productWooIds: [1, 3], variationWooIds: [2] });
	});
});

describe('resolveDirtyWooIds', () => {
	it('resolves products/variations mutations recordId→wooId, ignoring other collections and unresolved ids', async () => {
		const lookup = vi.fn(
			async (recordId: string) =>
				(({ 'uuid-1': 10, 'uuid-2': 20, 'uuid-3': null }) as Record<string, number | null>)[
					recordId
				] ?? null
		);
		const dirty = await resolveDirtyWooIds(
			[
				{ recordId: 'uuid-1', collectionName: 'products' },
				{ recordId: 'uuid-2', collectionName: 'variations' },
				{ recordId: 'uuid-3', collectionName: 'products' }, // unresolved → skipped
				{ recordId: 'uuid-9', collectionName: 'orders' }, // not a product/variation → ignored (not looked up)
			],
			lookup
		);
		expect([...dirty].sort((a, b) => a - b)).toEqual([10, 20]);
		expect(lookup).not.toHaveBeenCalledWith('uuid-9', 'orders');
	});
});

describe('reconcileExistence', () => {
	const manifest = (
		wooId: number,
		digest: string,
		objectType: 'product' | 'variation' = 'product'
	): ExistenceManifestDocument => ({
		id: String(wooId),
		wooId,
		objectType,
		digest,
	});
	const server = (
		id: number,
		digest: string,
		objectType: 'product' | 'variation' = 'product'
	): ServerDigestEntry => ({
		id,
		digest,
		objectType,
	});

	it('audits every bucket, pruning stale records and pulling missing/changed, via the lane handlers', async () => {
		const deleteProducts = vi.fn(async () => undefined);
		const deleteVariations = vi.fn(async () => undefined);
		const pullProducts = vi.fn(async () => undefined);
		const pullVariations = vi.fn(async () => undefined);

		const local: Record<number, ExistenceManifestDocument[]> = {
			0: [manifest(3, 'gone'), manifest(4, 'v-gone', 'variation')], // both server-absent → prune
			1: [manifest(1200, 'old')], // digest differs → repull
		};
		const serverByBucket: Record<number, ServerDigestEntry[]> = {
			0: [],
			1: [server(1200, 'new'), server(1300, 'fresh')], // 1300 missing locally → pull
		};

		const summary = await reconcileExistence({
			bucketSize: 1000,
			maxWooId: async () => 1300,
			readManifestRange: async (lo) => local[lo / 1000] ?? [],
			dirtyWooIds: async () => new Set<number>(),
			fetchServerBucket: async (bucket) => serverByBucket[bucket] ?? [],
			deleteProducts,
			deleteVariations,
			pullProducts,
			pullVariations,
		});

		// bucket 0: prune product 3 + variation 4 (routed to the right lane handlers, which also drop manifest rows)
		expect(deleteProducts).toHaveBeenCalledWith([3]);
		expect(deleteVariations).toHaveBeenCalledWith([4]);
		// bucket 1: pull 1300 then repull 1200 (both products; pull precedes repull in the plan dispatch)
		expect(pullProducts).toHaveBeenCalledWith([1300, 1200]);
		expect(pullVariations).not.toHaveBeenCalled();
		expect(summary).toEqual({ buckets: 2, pruned: 2, pulled: 1, repulled: 1, skippedDirty: 0 });
	});

	it('never prunes a record with a pending local write (dirty from the mutation queue)', async () => {
		const deleteProducts = vi.fn(async () => undefined);
		const summary = await reconcileExistence({
			bucketSize: 1000,
			maxWooId: async () => 5,
			readManifestRange: async () => [manifest(3, 'gone')], // server-absent, but dirty
			dirtyWooIds: async () => new Set<number>([3]),
			fetchServerBucket: async () => [],
			deleteProducts,
			deleteVariations: vi.fn(async () => undefined),
			pullProducts: vi.fn(async () => undefined),
			pullVariations: vi.fn(async () => undefined),
		});
		expect(deleteProducts).not.toHaveBeenCalled();
		expect(summary).toMatchObject({ pruned: 0, skippedDirty: 1 });
	});

	it('does nothing when there are no local ids (empty manifest)', async () => {
		const fetchServerBucket = vi.fn(async () => [] as ServerDigestEntry[]);
		const summary = await reconcileExistence({
			bucketSize: 1000,
			maxWooId: async () => 0,
			readManifestRange: async () => [],
			dirtyWooIds: async () => new Set<number>(),
			fetchServerBucket,
			deleteProducts: vi.fn(async () => undefined),
			deleteVariations: vi.fn(async () => undefined),
			pullProducts: vi.fn(async () => undefined),
			pullVariations: vi.fn(async () => undefined),
		});
		expect(fetchServerBucket).not.toHaveBeenCalled();
		expect(summary).toEqual({ buckets: 0, pruned: 0, pulled: 0, repulled: 0, skippedDirty: 0 });
	});
});
