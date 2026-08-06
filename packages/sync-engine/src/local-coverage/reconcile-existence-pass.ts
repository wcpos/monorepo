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
 * Walks the wooId space bucket by bucket; for each bucket it diffs the client's local manifest slice
 * against the server's authoritative set (reconcileBucketPlan) and dispatches the outcome: prune the
 * stale records, (re)pull the missing/changed ones. This is the periodic convergence backstop — Legs 1-2
 * carry the fast incremental path; this is the audit that guarantees the client's set eventually equals
 * the server's, catching the out-of-band removals no hook ever reported.
 *
 * Pure w.r.t. I/O: every side effect (manifest read, server fetch, prune, pull) is injected, so the
 * bucket-walk logic is testable in isolation and the caller owns storage/transport/cadence. The dirty
 * guard lives in reconcileBucketPlan — the caller marks `dirty` on the local entries it returns.
 *
 * CONCURRENCY STANCE (#949 tranche 2, ruling R10b). The walk yields to the event loop between
 * buckets, so a pull or a cashier's write CAN land mid-walk. That is not a new exposure — every
 * `await` in this loop already exposed the same window — and it is safe by construction:
 *
 *  - The unit of atomicity is a BUCKET, not the walk. A bucket's read -> plan -> prune -> pull
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
	pruned: number;
	pulled: number;
	repulled: number;
	skippedDirty: number;
};

export async function runExistenceReconcile(input: {
	/** The bucket indices to walk (the wiring derives these from the max wooId / bucket size). */
	buckets: readonly number[];
	bucketSize: number;
	readLocalBucket: (lo: number, hi: number) => Promise<LocalManifestEntry[]>;
	fetchServerBucket: (bucket: number, bucketSize: number) => Promise<ServerDigestEntry[]>;
	executePrune: (actions: ReconcileAction[]) => Promise<void>;
	/** Handles both pull (missing) and repull (changed) — both are a targeted server fetch. */
	enqueuePull: (actions: ReconcileAction[]) => Promise<void>;
	/** Stops the walk between buckets on teardown/scope-switch (no partial bucket left half-applied). */
	isAborted?: () => boolean;
}): Promise<ReconcileSummary> {
	const summary: ReconcileSummary = {
		buckets: 0,
		pruned: 0,
		pulled: 0,
		repulled: 0,
		skippedDirty: 0,
	};

	let iteration = 0;
	for (const bucket of input.buckets) {
		// Hand the event loop a turn BETWEEN buckets — never inside one (#949 tranche 2, R10b).
		// A bucket's read -> plan -> prune -> pull sequence stays one atomic unit, so the walk
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

		const [local, server] = await Promise.all([
			input.readLocalBucket(lo, hi),
			input.fetchServerBucket(bucket, input.bucketSize),
		]);
		// Re-check AFTER the in-flight reads: a scope-switch/teardown that flipped `isAborted` while they
		// were pending must NOT let this bucket's prune/pull mutate the DB post-teardown (codex P2).
		if (input.isAborted?.()) {
			break;
		}
		const plan = reconcileBucketPlan(local, server);

		if (plan.prune.length > 0) {
			await input.executePrune(plan.prune);
		}
		const toPull = [...plan.pull, ...plan.repull];
		if (toPull.length > 0) {
			await input.enqueuePull(toPull);
		}

		summary.buckets += 1;
		summary.pruned += plan.prune.length;
		summary.pulled += plan.pull.length;
		summary.repulled += plan.repull.length;
		summary.skippedDirty += plan.skippedDirty.length;
	}

	return summary;
}
