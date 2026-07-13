// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { runExistenceReconcile } from './reconcile-existence-pass';

import type { LocalManifestEntry, ServerDigestEntry } from '../reconcile-bucket-plan';

const L = (wooId: number, digest: string, dirty = false): LocalManifestEntry => ({
	wooId,
	digest,
	objectType: 'product',
	...(dirty ? { dirty: true } : {}),
});
const S = (id: number, digest: string): ServerDigestEntry => ({
	id,
	digest,
	objectType: 'product',
});

describe('runExistenceReconcile', () => {
	it('walks each bucket by its id-range and dispatches prune + (re)pull, accumulating a summary', async () => {
		const executePrune = vi.fn(async () => undefined);
		const enqueuePull = vi.fn(async () => undefined);
		const local: Record<number, LocalManifestEntry[]> = {
			0: [L(3, 'gone'), L(4, 'old')], // 3 → prune, 4 → repull
			1: [], // 15 → pull
		};
		const server: Record<number, ServerDigestEntry[]> = {
			0: [S(4, 'new')],
			1: [S(15, 'x')],
		};

		const summary = await runExistenceReconcile({
			buckets: [0, 1],
			bucketSize: 10,
			readLocalBucket: async (lo) => local[lo / 10] ?? [],
			fetchServerBucket: async (bucket) => server[bucket] ?? [],
			executePrune,
			enqueuePull,
		});

		// bucket 0: prune [3], repull [4]; bucket 1: pull [15]
		expect(executePrune).toHaveBeenCalledTimes(1);
		expect(executePrune).toHaveBeenCalledWith([{ wooId: 3, objectType: 'product' }]);
		expect((enqueuePull.mock.calls as unknown as [unknown][]).map((c) => c[0])).toEqual([
			[{ wooId: 4, objectType: 'product' }], // bucket 0 repull
			[{ wooId: 15, objectType: 'product' }], // bucket 1 pull
		]);
		expect(summary).toEqual({ buckets: 2, pruned: 1, pulled: 1, repulled: 1, skippedDirty: 0 });
	});

	it('reads local and server for the correct half-open id-range per bucket', async () => {
		const readLocalBucket = vi.fn(async () => [] as LocalManifestEntry[]);
		const fetchServerBucket = vi.fn(async () => [] as ServerDigestEntry[]);
		await runExistenceReconcile({
			buckets: [0, 1, 2],
			bucketSize: 1000,
			readLocalBucket,
			fetchServerBucket,
			executePrune: vi.fn(async () => undefined),
			enqueuePull: vi.fn(async () => undefined),
		});
		expect(readLocalBucket.mock.calls).toEqual([
			[0, 1000],
			[1000, 2000],
			[2000, 3000],
		]);
		expect(fetchServerBucket.mock.calls).toEqual([
			[0, 1000],
			[1, 1000],
			[2, 1000],
		]);
	});

	it('does not call prune/pull for an in-sync bucket', async () => {
		const executePrune = vi.fn(async () => undefined);
		const enqueuePull = vi.fn(async () => undefined);
		const summary = await runExistenceReconcile({
			buckets: [0],
			bucketSize: 10,
			readLocalBucket: async () => [L(1, 'a')],
			fetchServerBucket: async () => [S(1, 'a')],
			executePrune,
			enqueuePull,
		});
		expect(executePrune).not.toHaveBeenCalled();
		expect(enqueuePull).not.toHaveBeenCalled();
		expect(summary).toEqual({ buckets: 1, pruned: 0, pulled: 0, repulled: 0, skippedDirty: 0 });
	});

	it('carries the dirty-guard count through and never prunes a dirty record', async () => {
		const executePrune = vi.fn(async () => undefined);
		const summary = await runExistenceReconcile({
			buckets: [0],
			bucketSize: 10,
			readLocalBucket: async () => [L(1, 'a', true)], // dirty + server-absent → skippedDirty, NOT pruned
			fetchServerBucket: async () => [],
			executePrune,
			enqueuePull: vi.fn(async () => undefined),
		});
		expect(executePrune).not.toHaveBeenCalled();
		expect(summary.skippedDirty).toBe(1);
		expect(summary.pruned).toBe(0);
	});

	it('does not prune/pull a bucket whose abort flipped DURING its in-flight reads', async () => {
		const executePrune = vi.fn(async () => undefined);
		const enqueuePull = vi.fn(async () => undefined);
		let aborted = false;
		const summary = await runExistenceReconcile({
			buckets: [0],
			bucketSize: 10,
			readLocalBucket: async () => {
				aborted = true; // teardown races in while this read is pending
				return [L(3, 'gone')]; // would prune if applied
			},
			fetchServerBucket: async () => [],
			executePrune,
			enqueuePull,
			isAborted: () => aborted,
		});
		// The post-read re-check bails before mutating.
		expect(executePrune).not.toHaveBeenCalled();
		expect(enqueuePull).not.toHaveBeenCalled();
		expect(summary).toEqual({ buckets: 0, pruned: 0, pulled: 0, repulled: 0, skippedDirty: 0 });
	});

	it('applies the current bucket then stops at the next boundary when aborted mid-apply', async () => {
		let aborted = false;
		const summary = await runExistenceReconcile({
			buckets: [0, 1, 2],
			bucketSize: 10,
			readLocalBucket: async (lo) => (lo === 0 ? [L(3, 'gone')] : []), // bucket 0 has a prunable record
			fetchServerBucket: async () => [],
			executePrune: async () => {
				aborted = true; // teardown races in as bucket 0 applies its prune
			},
			enqueuePull: vi.fn(async () => undefined),
			isAborted: () => aborted,
		});
		// Bucket 0 fully applied (pruned 1); buckets 1 & 2 skipped at the top-of-loop check.
		expect(summary).toEqual({ buckets: 1, pruned: 1, pulled: 0, repulled: 0, skippedDirty: 0 });
	});
});
