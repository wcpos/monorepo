import { yieldToEventLoop } from '../event-loop-yield';
import {
	type LocalManifestEntry,
	type ReconcileAction,
	reconcileBucketPlan,
	type ServerDigestEntry,
} from '../reconcile-bucket-plan';

/**
 * Leg-3 existence reconcile — the pure bucket-walk orchestration (ADR 0014 increment 5c-core).
 *
 * Walks the locally occupied wooId buckets; for each nonempty local manifest slice it diffs against the
 * server's authoritative set (reconcileBucketPlan), prunes stale records, and reports missing/changed
 * records without downloading them. Coverage gaps belong to the census and polite demand lanes.
 *
 * Pure w.r.t. I/O: every side effect (manifest read, server fetch, prune) is injected, so the
 * bucket-walk logic is testable in isolation and the caller owns storage/transport/cadence. The dirty
 * guard lives in reconcileBucketPlan — the caller marks `dirty` on the local entries it returns.
 *
 * CONCURRENCY STANCE (#949 tranche 2, ruling R10b). The walk yields to the event loop between
 * buckets, so another lane or a cashier's write CAN land mid-walk. That is not a new exposure — every
 * `await` in this loop already exposed the same window — and it is safe by construction:
 *
 *  - The unit of atomicity is a BUCKET, not the walk. A bucket's read -> plan -> prune
 *    sequence contains no yield, so no bucket is ever left half-applied and the coverage ledger's
 *    invariants (#942/#959) never observe a partial bucket.
 *  - Buckets are disjoint wooId ranges, so a bucket's plan can never be invalidated by work done
 *    in another bucket.
 *  - The `dirty` set is a snapshot taken before the walk, so a record that becomes dirty mid-walk
 *    is not protected by THIS plan. It is still protected at execution: the prune executor re-reads
 *    each document and re-checks `hasPendingLocalWork` at delete time, which is the authoritative
 *    guard. The snapshot is an optimisation, never the safety net.
 *  - A record written or removed mid-walk that this pass therefore mis-plans is simply re-diffed on
 *    the next pass. The reconcile is a periodic convergence backstop, not a transaction: being one
 *    audit behind is its normal steady state.
 *  - `buckets` is fixed at entry, so the walk cannot be extended by concurrent inserts — a store
 *    under continuous change-signal load still terminates in a bounded number of buckets.
 */

export type ReconcileSummary = {
	buckets: number;
	emptyBuckets: number;
	pruned: number;
	missing: number;
	changed: number;
	skippedDirty: number;
	/** Pressure arrived mid-walk, so remaining buckets stay for a later cadence. */
	deferred?: true;
};

export type ExistenceScanBucket = {
	bucket: number;
	storedCount: number;
	currentCount: number;
	storedDigest: string;
	currentDigest: string;
	match: boolean;
};

export type ExistenceScanPage = {
	changes: ExistenceScanBucket[];
	nextAfterId: number;
	complete: boolean;
};

/** Fold unsigned-64-bit decimal digests without passing through lossy JS numbers. */
export function xor64(digests: Iterable<string>): string {
	let folded = 0n;
	for (const digest of digests) {
		folded ^= BigInt(digest);
	}
	return BigInt.asUintN(64, folded).toString();
}

/** Fetch aggregate pages, then classify each occupied local bucket as clean or drill-down-worthy. */
export async function findExistenceReconcileCandidates(input: {
	buckets: readonly number[];
	bucketSize: number;
	readLocalBucket: (lo: number, hi: number) => Promise<LocalManifestEntry[]>;
	fetchServerScanPage: (afterId: number, bucketSize: number) => Promise<ExistenceScanPage>;
	isAborted?: () => boolean;
	maxScanPages?: number;
}): Promise<{ candidates: number[]; emptyBuckets: number }> {
	if (input.buckets.length === 0) return { candidates: [], emptyBuckets: 0 };

	const aggregates = new Map<number, ExistenceScanBucket>();
	const sortedBuckets = [...input.buckets].sort((a, b) => a - b);
	const highestBucket = sortedBuckets[sortedBuckets.length - 1]!;
	const pastHighestId = (highestBucket + 1) * input.bucketSize;
	// The pager visits OCCUPIED buckets only. Two facts make contiguous paging wrong here:
	// the walk starts at the lowest occupied bucket, not id 0 (the #1084 shape — one recent
	// high-id order must not page through empty low windows), and between pages it JUMPS the
	// gaps between occupied buckets (wp_posts ids are shared with posts/media/revisions, so
	// product buckets are sparse on old stores — a contiguous crawl would burn the page budget
	// on windows this manifest holds nothing in). Skipped windows need no audit: this lane
	// only prunes local-extra and flags changed rows in buckets the client occupies; wholly
	// server-side buckets belong to the census/demand lanes (#1090 audit-only ruling).
	// after_id = bucket*size - 1 makes the server's first_bucket exactly that bucket.
	let nextUncovered = 0; // index into sortedBuckets of the first bucket no fetched window covered
	let pages = 0;
	while (!input.isAborted?.() && pages < (input.maxScanPages ?? Infinity)) {
		const targetBucket = sortedBuckets[nextUncovered]!;
		const afterId = Math.max(0, targetBucket * input.bucketSize - 1);
		const page = await input.fetchServerScanPage(afterId, input.bucketSize);
		pages += 1;
		for (const row of page.changes) aggregates.set(row.bucket, row);
		if (page.complete || page.nextAfterId >= pastHighestId) break;
		if (page.nextAfterId <= afterId) {
			throw new Error('existence scan checkpoint did not advance');
		}
		// Advance past every occupied bucket the fetched window covered; the next fetch opens
		// at the first still-uncovered occupied bucket, skipping any empty gap in between.
		while (
			nextUncovered < sortedBuckets.length &&
			(sortedBuckets[nextUncovered]! + 1) * input.bucketSize - 1 <= page.nextAfterId
		) {
			nextUncovered += 1;
		}
		if (nextUncovered >= sortedBuckets.length) break;
	}

	const candidates: number[] = [];
	let emptyBuckets = 0;
	for (let index = 0; index < input.buckets.length; index += 1) {
		if (index > 0) await yieldToEventLoop();
		if (input.isAborted?.()) break;
		const bucket = input.buckets[index]!;
		const lo = bucket * input.bucketSize;
		const local = await input.readLocalBucket(lo, lo + input.bucketSize);
		if (input.isAborted?.()) break;
		if (local.length === 0) {
			emptyBuckets += 1;
			continue;
		}
		const aggregate = aggregates.get(bucket);
		if (
			!aggregate ||
			!aggregate.match ||
			aggregate.storedCount !== local.length ||
			aggregate.storedDigest !== xor64(local.map(({ digest }) => digest))
		) {
			candidates.push(bucket);
		}
	}
	return { candidates, emptyBuckets };
}

export async function runExistenceReconcile(input: {
	/** The occupied bucket indices to walk, derived from the local manifest. */
	buckets: readonly number[];
	bucketSize: number;
	readLocalBucket: (lo: number, hi: number) => Promise<LocalManifestEntry[]>;
	fetchServerBucket: (bucket: number, bucketSize: number) => Promise<ServerDigestEntry[]>;
	executePrune: (actions: ReconcileAction[]) => Promise<void>;
	/** Stops the walk between buckets on teardown/scope-switch (no partial bucket left half-applied). */
	isAborted?: () => boolean;
	/** Stops the walk between buckets while preserving the bucket atomic unit. */
	shouldDefer?: () => boolean;
}): Promise<ReconcileSummary> {
	const summary: ReconcileSummary = {
		buckets: 0,
		emptyBuckets: 0,
		pruned: 0,
		missing: 0,
		changed: 0,
		skippedDirty: 0,
	};

	let iteration = 0;
	for (const bucket of input.buckets) {
		// Hand the event loop a turn BETWEEN buckets — never inside one (#949 tranche 2, R10b).
		// A bucket's read -> plan -> prune sequence stays one atomic unit, so the walk
		// still never leaves a bucket half-applied; this only widens the gap the walk already
		// had between them, which every await here already exposed to concurrent writes.
		// The abort check below deliberately follows the yield, so a teardown that lands WHILE
		// the walk is parked here stops it before the next bucket mutates anything.
		if (iteration > 0) {
			await yieldToEventLoop();
		}
		iteration += 1;
		if (input.isAborted?.()) {
			break;
		}
		if (input.shouldDefer?.()) {
			summary.deferred = true;
			break;
		}
		const lo = bucket * input.bucketSize;
		const hi = lo + input.bucketSize;

		const local = await input.readLocalBucket(lo, hi);
		if (input.isAborted?.()) {
			break;
		}
		if (local.length === 0) {
			summary.emptyBuckets += 1;
			continue;
		}
		const server = await input.fetchServerBucket(bucket, input.bucketSize);
		// Re-check AFTER the in-flight reads: a scope-switch/teardown that flipped `isAborted` while they
		// were pending must NOT let this bucket's prune mutate the DB post-teardown (codex P2).
		if (input.isAborted?.()) {
			break;
		}
		const plan = reconcileBucketPlan(local, server);

		if (plan.prune.length > 0) {
			await input.executePrune(plan.prune);
		}
		summary.buckets += 1;
		summary.pruned += plan.prune.length;
		summary.missing += plan.missing.length;
		summary.changed += plan.changed.length;
		summary.skippedDirty += plan.skippedDirty.length;
	}

	return summary;
}
