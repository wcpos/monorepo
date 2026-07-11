import {
  reconcileBucketPlan,
  type LocalManifestEntry,
  type ReconcileAction,
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
  const summary: ReconcileSummary = { buckets: 0, pruned: 0, pulled: 0, repulled: 0, skippedDirty: 0 };

  for (const bucket of input.buckets) {
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
