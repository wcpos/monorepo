// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { runExistenceReconcile } from './reconcile-existence-pass';

import type {
	LocalManifestEntry,
	ReconcileAction,
	ServerDigestEntry,
} from '../reconcile-bucket-plan';

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
			readLocalBucket: () => Promise.resolve([]),
			fetchServerBucket: () => Promise.resolve([]),
			executePrune: async () => undefined,
			enqueuePull: async () => undefined,
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
			readLocalBucket: async (lo) => (lo === 10 ? [L(3, 'gone')] : []),
			fetchServerBucket: async () => [],
			executePrune,
			enqueuePull: async () => undefined,
			isAborted: () => aborted,
		});

		expect(executePrune).not.toHaveBeenCalled();
		expect(summary.buckets).toBe(1);
	});

	it('re-diffs each bucket against state as of THAT bucket, tolerating a mid-walk write', async () => {
		// The cashier edits a record in bucket 1 while bucket 0 is being applied. Buckets are
		// disjoint id ranges, so bucket 0's plan is unaffected and bucket 1 simply sees the new
		// state when its own read runs — no stale plan is executed against changed data.
		const enqueuePull = vi.fn(async (_actions: ReconcileAction[]) => undefined);
		let editedMidWalk = false;

		const summary = await runExistenceReconcile({
			buckets: [0, 1],
			bucketSize: 10,
			readLocalBucket: async (lo) =>
				lo === 0 ? [L(4, 'old')] : [L(14, editedMidWalk ? 'dirty-now' : 'old', editedMidWalk)],
			fetchServerBucket: async (bucket) => (bucket === 0 ? [S(4, 'new')] : [S(14, 'new')]),
			executePrune: async () => undefined,
			enqueuePull: async (actions) => {
				editedMidWalk = true; // a write lands as bucket 0 applies
				await enqueuePull(actions);
			},
		});

		// Bucket 0 repulled 4; bucket 1 saw wooId 14 as dirty by the time it was read and left it
		// to the write path rather than clobbering the un-pushed edit.
		expect(summary).toEqual({ buckets: 2, pruned: 0, pulled: 0, repulled: 1, skippedDirty: 1 });
		expect(enqueuePull).toHaveBeenCalledTimes(1);
	});
});
