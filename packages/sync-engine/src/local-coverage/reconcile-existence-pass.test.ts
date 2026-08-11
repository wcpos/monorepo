// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	findExistenceReconcileCandidates,
	runExistenceReconcile,
	xor64,
} from './reconcile-existence-pass';

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

describe('xor64', () => {
	it('folds unsigned decimal digests above Number.MAX_SAFE_INTEGER without precision loss', () => {
		expect(xor64(['9007199254740992', '9007199254740993'])).toBe('1');
	});

	it('uses zero as the empty-fold identity', () => {
		expect(xor64([])).toBe('0');
	});
});

describe('findExistenceReconcileCandidates', () => {
	it('classifies a matching aggregate and local manifest slice as clean', async () => {
		const result = await findExistenceReconcileCandidates({
			buckets: [0],
			bucketSize: 1000,
			readLocalBucket: async () => [L(1, '9007199254740992'), L(2, '9007199254740993')],
			fetchServerScanPage: async () => ({
				changes: [
					{
						bucket: 0,
						storedCount: 2,
						currentCount: 2,
						storedDigest: '1',
						currentDigest: '1',
						match: true,
					},
				],
				nextAfterId: 1000,
				complete: true,
			}),
		});

		expect(result).toEqual({ candidates: [], emptyBuckets: 0 });
	});

	it('treats a missing scan row as a drill-down candidate', async () => {
		const result = await findExistenceReconcileCandidates({
			buckets: [4],
			bucketSize: 1000,
			readLocalBucket: async () => [L(4001, '7')],
			fetchServerScanPage: async () => ({
				changes: [],
				nextAfterId: 5000,
				complete: true,
			}),
		});

		expect(result).toEqual({ candidates: [4], emptyBuckets: 0 });
	});

	it('starts the scan window at the lowest occupied bucket, not id 0', async () => {
		const requestedAfterIds: number[] = [];
		const result = await findExistenceReconcileCandidates({
			buckets: [800, 801],
			bucketSize: 1000,
			readLocalBucket: async (lo) => [L(lo + 1, '7')],
			fetchServerScanPage: async (afterId) => {
				requestedAfterIds.push(afterId);
				return {
					changes: [
						{
							bucket: 800,
							storedCount: 1,
							currentCount: 1,
							storedDigest: '7',
							currentDigest: '7',
							match: true,
						},
						{
							bucket: 801,
							storedCount: 1,
							currentCount: 1,
							storedDigest: '7',
							currentDigest: '7',
							match: true,
						},
					],
					nextAfterId: 849_999,
					complete: true,
				};
			},
		});

		// One page, opened just below bucket 800 — a high-id manifest (the #1084 shape)
		// must never page through the empty low windows beneath it.
		expect(requestedAfterIds).toEqual([799_999]);
		expect(result).toEqual({ candidates: [], emptyBuckets: 0 });
	});

	it('stops aggregate pagination at the declared scan-page ceiling', async () => {
		const fetchServerScanPage = vi.fn(async (afterId: number) => ({
			changes: [],
			nextAfterId: afterId + 1_000,
			complete: false,
		}));
		await findExistenceReconcileCandidates({
			buckets: [0, 1, 2],
			bucketSize: 1_000,
			readLocalBucket: async (lo) => [L(lo + 1, '7')],
			fetchServerScanPage,
			maxScanPages: 1,
		});

		expect(fetchServerScanPage).toHaveBeenCalledTimes(1);
	});

	it('jumps the gap between sparse occupied buckets instead of crawling contiguous windows', async () => {
		const cleanRow = (bucket: number) => ({
			bucket,
			storedCount: 1,
			currentCount: 1,
			storedDigest: '7',
			currentDigest: '7',
			match: true,
		});
		const requestedAfterIds: number[] = [];
		const result = await findExistenceReconcileCandidates({
			buckets: [0, 800],
			bucketSize: 1000,
			maxScanPages: 3,
			readLocalBucket: async (lo) => [L(lo + 1, '7')],
			fetchServerScanPage: async (afterId) => {
				requestedAfterIds.push(afterId);
				return afterId === 0
					? { changes: [cleanRow(0)], nextAfterId: 49_999, complete: false }
					: { changes: [cleanRow(800)], nextAfterId: 849_999, complete: true };
			},
		});

		// Two pages: [0..50k) then a jump straight to bucket 800's window — the 750-bucket
		// gap (shared wp_posts ids: posts/media/revisions) is never crawled.
		expect(requestedAfterIds).toEqual([0, 799_999]);
		expect(result).toEqual({ candidates: [], emptyBuckets: 0 });
	});
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

	it('stops without counting an empty bucket when abort flips during its local read', async () => {
		let aborted = false;
		const fetchServerBucket = vi.fn(async () => [] as ServerDigestEntry[]);
		const summary = await runExistenceReconcile({
			buckets: [0],
			bucketSize: 10,
			readLocalBucket: async () => {
				aborted = true;
				return [];
			},
			fetchServerBucket,
			executePrune: vi.fn(async () => undefined),
			isAborted: () => aborted,
		});

		expect(fetchServerBucket).not.toHaveBeenCalled();
		expect(summary).toMatchObject({ buckets: 0, emptyBuckets: 0 });
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

	it('completes the active bucket then defers before the next when server pressure begins', async () => {
		let backingOff = false;
		const fetchServerBucket = vi.fn(async (bucket: number) => {
			if (bucket === 0) backingOff = true;
			return [] as ServerDigestEntry[];
		});
		const summary = await runExistenceReconcile({
			buckets: [0, 1],
			bucketSize: 10,
			readLocalBucket: async (lo) => [L(lo + 1, 'gone')],
			fetchServerBucket,
			executePrune: async () => undefined,
			shouldDefer: () => backingOff,
		});

		expect(fetchServerBucket).toHaveBeenCalledTimes(1);
		expect(summary).toMatchObject({ buckets: 1, pruned: 1, deferred: true });
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
