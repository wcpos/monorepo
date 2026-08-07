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
};

export async function runExistenceReconcile(input: {
	/** The bucket indices to walk (the wiring derives these from the max wooId / bucket size). */
	buckets: readonly number[];
	bucketSize: number;
	readLocalBucket: (lo: number, hi: number) => Promise<LocalManifestEntry[]>;
	fetchServerBucket: (bucket: number, bucketSize: number) => Promise<ServerDigestEntry[]>;
	executePrune: (actions: ReconcileAction[]) => Promise<void>;
	/** Stops the walk between buckets on teardown/scope-switch (no partial bucket left half-applied). */
	isAborted?: () => boolean;
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
		const lo = bucket * input.bucketSize;
		const hi = lo + input.bucketSize;

		const local = await input.readLocalBucket(lo, hi);
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
