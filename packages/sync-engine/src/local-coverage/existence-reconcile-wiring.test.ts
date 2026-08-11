// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { ExistenceManifestDocument } from '@wcpos/sync-engine/testing';

import { partitionActionsByLane, reconcileExistence, resolveDirtyWooIds } from './reconciliation';

import type { ServerDigestEntry } from '../reconcile-bucket-plan';

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

	it('audits every nonempty bucket, routes prune through delete handlers, and reports missing/changed', async () => {
		const deleteProducts = vi.fn(async () => undefined);
		const deleteVariations = vi.fn(async () => undefined);

		const local: Record<number, ExistenceManifestDocument[]> = {
			0: [manifest(3, '1'), manifest(4, '2', 'variation')], // both server-absent → prune
			1: [manifest(1200, '4')], // digest differs → changed
		};
		const serverByBucket: Record<number, ServerDigestEntry[]> = {
			0: [],
			1: [server(1200, '5'), server(1300, '6')], // 1300 missing locally
		};

		const summary = await reconcileExistence({
			bucketSize: 1000,
			occupiedBucketIndexes: async () => [0, 1],
			readManifestRange: async (lo) => local[lo / 1000] ?? [],
			dirtyWooIds: async () => new Set<number>(),
			fetchServerScanPage: async () => ({
				changes: [
					{
						bucket: 1,
						storedCount: 2,
						currentCount: 2,
						storedDigest: '3',
						currentDigest: '3',
						match: true,
					},
				],
				nextAfterId: 2000,
				complete: true,
			}),
			fetchServerBucket: async (bucket) => serverByBucket[bucket] ?? [],
			deleteProducts,
			deleteVariations,
		});

		// bucket 0: prune product 3 + variation 4 (routed to the right lane handlers, which also drop manifest rows)
		expect(deleteProducts).toHaveBeenCalledWith([3]);
		expect(deleteVariations).toHaveBeenCalledWith([4]);
		expect(summary).toEqual({
			buckets: 2,
			emptyBuckets: 0,
			pruned: 2,
			missing: 1,
			changed: 1,
			skippedDirty: 0,
		});
	});

	it('reads only occupied buckets for a sparse high-ID manifest', async () => {
		const readManifestRange = vi.fn(async (lo: number) =>
			lo === 0 ? [manifest(3, 'low')] : lo === 10_000 ? [manifest(10_003, 'high')] : []
		);

		await reconcileExistence({
			bucketSize: 1000,
			occupiedBucketIndexes: async () => [0, 10],
			readManifestRange,
			dirtyWooIds: async () => new Set<number>(),
			fetchServerScanPage: async () => ({
				changes: [],
				nextAfterId: 11_000,
				complete: true,
			}),
			fetchServerBucket: async () => [],
			deleteProducts: vi.fn(async () => undefined),
			deleteVariations: vi.fn(async () => undefined),
		});

		expect(readManifestRange.mock.calls).toEqual([
			[0, 1000],
			[10_000, 11_000],
			[0, 1000],
			[10_000, 11_000],
		]);
	});

	it('never prunes a record with a pending local write (dirty from the mutation queue)', async () => {
		const deleteProducts = vi.fn(async () => undefined);
		const summary = await reconcileExistence({
			bucketSize: 1000,
			occupiedBucketIndexes: async () => [0],
			readManifestRange: async () => [manifest(3, 'gone')], // server-absent, but dirty
			dirtyWooIds: async () => new Set<number>([3]),
			fetchServerScanPage: async () => ({
				changes: [],
				nextAfterId: 1000,
				complete: true,
			}),
			fetchServerBucket: async () => [],
			deleteProducts,
			deleteVariations: vi.fn(async () => undefined),
		});
		expect(deleteProducts).not.toHaveBeenCalled();
		expect(summary).toMatchObject({ pruned: 0, skippedDirty: 1 });
	});

	it('does nothing when there are no local ids (empty manifest)', async () => {
		const fetchServerBucket = vi.fn(async () => [] as ServerDigestEntry[]);
		const fetchServerScanPage = vi.fn(async () => ({
			changes: [],
			nextAfterId: 0,
			complete: true,
		}));
		const summary = await reconcileExistence({
			bucketSize: 1000,
			occupiedBucketIndexes: async () => [],
			readManifestRange: async () => [],
			dirtyWooIds: async () => new Set<number>(),
			fetchServerScanPage,
			fetchServerBucket,
			deleteProducts: vi.fn(async () => undefined),
			deleteVariations: vi.fn(async () => undefined),
		});
		expect(fetchServerBucket).not.toHaveBeenCalled();
		expect(fetchServerScanPage).not.toHaveBeenCalled();
		expect(summary).toEqual({
			buckets: 0,
			emptyBuckets: 0,
			pruned: 0,
			missing: 0,
			changed: 0,
			skippedDirty: 0,
		});
	});
});
