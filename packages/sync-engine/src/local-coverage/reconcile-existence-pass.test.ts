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
	it('audits nonempty local buckets, dispatches prune only, and counts missing/changed records', async () => {
		const executePrune = vi.fn(async () => undefined);
		const local: Record<number, LocalManifestEntry[]> = {
			0: [L(3, 'gone'), L(4, 'old')], // 3 → prune, 4 → changed
			1: [L(12, 'same')], // 15 → missing
		};
		const server: Record<number, ServerDigestEntry[]> = {
			0: [S(4, 'new')],
			1: [S(12, 'same'), S(15, 'x')],
		};

		const summary = await runExistenceReconcile({
			buckets: [0, 1],
			bucketSize: 10,
			readLocalBucket: async (lo) => local[lo / 10] ?? [],
			fetchServerBucket: async (bucket) => server[bucket] ?? [],
			executePrune,
		});

		// bucket 0: prune [3], changed [4]; bucket 1: missing [15]
		expect(executePrune).toHaveBeenCalledTimes(1);
		expect(executePrune).toHaveBeenCalledWith([{ wooId: 3, objectType: 'product' }]);
		expect(summary).toEqual({
			buckets: 2,
			emptyBuckets: 0,
			pruned: 1,
			missing: 1,
			changed: 1,
			skippedDirty: 0,
		});
	});

	it('reads local ranges first and skips server fetches for empty local buckets', async () => {
		const readLocalBucket = vi.fn(async (lo: number) => (lo === 1000 ? [] : [L(lo + 1, 'local')]));
		const fetchServerBucket = vi.fn(async () => [] as ServerDigestEntry[]);
		const summary = await runExistenceReconcile({
			buckets: [0, 1, 2],
			bucketSize: 1000,
			readLocalBucket,
			fetchServerBucket,
			executePrune: vi.fn(async () => undefined),
		});
		expect(readLocalBucket.mock.calls).toEqual([
			[0, 1000],
			[1000, 2000],
			[2000, 3000],
		]);
		expect(fetchServerBucket.mock.calls).toEqual([
			[0, 1000],
			[2, 1000],
		]);
		expect(summary).toMatchObject({ buckets: 2, emptyBuckets: 1 });
	});

	it('does not call prune for an in-sync bucket', async () => {
		const executePrune = vi.fn(async () => undefined);
		const summary = await runExistenceReconcile({
			buckets: [0],
			bucketSize: 10,
			readLocalBucket: async () => [L(1, 'a')],
			fetchServerBucket: async () => [S(1, 'a')],
			executePrune,
		});
		expect(executePrune).not.toHaveBeenCalled();
		expect(summary).toEqual({
			buckets: 1,
			emptyBuckets: 0,
			pruned: 0,
			missing: 0,
			changed: 0,
			skippedDirty: 0,
		});
	});

	it('carries the dirty-guard count through and never prunes a dirty record', async () => {
		const executePrune = vi.fn(async () => undefined);
		const summary = await runExistenceReconcile({
			buckets: [0],
			bucketSize: 10,
			readLocalBucket: async () => [L(1, 'a', true)], // dirty + server-absent → skippedDirty, NOT pruned
			fetchServerBucket: async () => [],
			executePrune,
		});
		expect(executePrune).not.toHaveBeenCalled();
		expect(summary.skippedDirty).toBe(1);
		expect(summary.pruned).toBe(0);
	});

	it('does not prune a bucket whose abort flipped DURING its sequential reads', async () => {
		const executePrune = vi.fn(async () => undefined);
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
			isAborted: () => aborted,
		});
		// The post-read re-check bails before mutating.
		expect(executePrune).not.toHaveBeenCalled();
		expect(summary).toEqual({
			buckets: 0,
			emptyBuckets: 0,
			pruned: 0,
			missing: 0,
			changed: 0,
			skippedDirty: 0,
		});
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
			isAborted: () => aborted,
		});
		// Bucket 0 fully applied (pruned 1); buckets 1 & 2 skipped at the top-of-loop check.
		expect(summary).toEqual({
			buckets: 1,
			emptyBuckets: 0,
			pruned: 1,
			missing: 0,
			changed: 0,
			skippedDirty: 0,
		});
	});

	// --- event-loop fairness (#949 tranche 2, ruling R10b) ---------------------------------------

	it('hands the event loop a turn BETWEEN buckets, so a long walk cannot freeze the UI', async () => {
		// A self-rearming macrotask ticks once per turn the loop gets. Under the node host the
		// yield resolves through setImmediate, whose queue is FIFO, so the count is exact.
		let turns = 0;
		let running = true;
		const rearm = () => {
			if (!running) return;
			turns += 1;
			setImmediate(rearm);
		};
		setImmediate(rearm);

		await runExistenceReconcile({
			buckets: [0, 1, 2, 3],
			bucketSize: 10,
			readLocalBucket: (lo) => Promise.resolve([L(lo + 1, 'same')]),
			fetchServerBucket: () => Promise.resolve([]),
			executePrune: async () => undefined,
		});
		running = false;

		// Three boundaries between four buckets — never before the first, never after the last.
		expect(turns).toBe(3);
	});

	it('re-checks abort AFTER the between-bucket yield, so teardown during it stops the walk', async () => {
		const executePrune = vi.fn(async () => undefined);
		let aborted = false;
		// Teardown lands while the walk is parked on its between-bucket yield.
		setImmediate(() => void (aborted = true));

		const summary = await runExistenceReconcile({
			buckets: [0, 1],
			bucketSize: 10,
			readLocalBucket: async (lo) => (lo === 0 ? [] : [L(13, 'gone')]),
			fetchServerBucket: async () => [],
			executePrune,
			isAborted: () => aborted,
		});

		expect(executePrune).not.toHaveBeenCalled();
		expect(summary).toMatchObject({ buckets: 0, emptyBuckets: 1 });
	});

	it('re-diffs each bucket against state as of THAT bucket, tolerating a mid-walk write', async () => {
		// The cashier edits a record in bucket 1 while bucket 0 is being applied. Buckets are
		// disjoint id ranges, so bucket 0's plan is unaffected and bucket 1 simply sees the new
		// state when its own read runs — no stale plan is executed against changed data.
		let editedMidWalk = false;

		const summary = await runExistenceReconcile({
			buckets: [0, 1],
			bucketSize: 10,
			readLocalBucket: async (lo) =>
				lo === 0 ? [L(4, 'gone')] : [L(14, editedMidWalk ? 'dirty-now' : 'old', editedMidWalk)],
			fetchServerBucket: async (bucket) => (bucket === 0 ? [] : [S(14, 'new')]),
			executePrune: async () => {
				editedMidWalk = true; // a write lands as bucket 0 applies its prune
			},
		});

		// Bucket 0 pruned 4; bucket 1 saw wooId 14 as dirty by the time it was read and left it
		// to the write path rather than pruning the un-pushed edit.
		expect(summary).toEqual({
			buckets: 2,
			emptyBuckets: 0,
			pruned: 1,
			missing: 0,
			changed: 0,
			skippedDirty: 1,
		});
	});
});
