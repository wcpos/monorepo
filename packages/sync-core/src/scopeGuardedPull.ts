/**
 * Scope-guarded pull — the one safe way to run a custom-pull batch against a
 * StoreScopeManager-managed scope. Extracted from the electron and expo lab
 * controllers, which had grown two near-identical copies of this wiring.
 *
 * The contract (storeScopeManager.ts header, CONTEXT.md "Store switching"):
 * the whole pull runs under ONE manager.runGuarded capture; every fetch goes
 * through the bound scoped fetch (late responses dropped + counted) and every
 * write — documents AND checkpoint — through bound.guardWrite (stale writes
 * dropped + counted). Switching scope mid-pull therefore aborts or drops the
 * pull instead of poisoning the other scope's database.
 */

import {
  syncCustomPullBatchIntoRepository,
  type CustomPullCheckpointStore,
  type CustomPullRepository,
} from './customPullAdapter';
import { runScopeGuardedOperation } from './scopeGuardedOperation';
import { type Fetcher, type ScopeBound, type StoreScopeManager } from './storeScopeManager';

export type ScopeGuardedPullResult = {
  /**
   * - 'applied':  batch fetched and written under a still-current ticket
   * - 'dropped':  a guarded write (documents or checkpoint) arrived after the
   *               scope moved on — counted + evented by the manager, never
   *               persisted
   * - 'stale':    the response itself landed after the epoch moved
   *               (ScopeStaleError from scopedFetch) — no write was attempted
   * - 'aborted':  the in-flight request was aborted by a switch/reset
   * - 'error':    any other failure (HTTP error, repository throw, ...)
   */
  status: 'applied' | 'dropped' | 'aborted' | 'stale' | 'error';
  /** Documents written (post-dedupe, post pending-mutation filter); 0 unless 'applied'. */
  applied: number;
  hasMore: boolean | null;
  detail?: string;
};

/**
 * Runs one custom-pull batch with full scope-safety wiring. Callers hand over
 * their RAW fetcher, repository, and checkpoint store — scopedFetch and
 * guardWrite wrapping happen HERE, so hosts cannot forget a guard.
 *
 * Capture happens inside manager.runGuarded at call time — no preceding-await
 * discipline is required of callers. Anything the host must read
 * asynchronously before the fetch (the pending-mutation set) goes in as a
 * provider, resolved AFTER capture — so a scope switch landing during that
 * read leaves the whole batch pinned to the old scope and every write drops
 * (caught by both hosts' switch-mid-pull tests).
 */
export async function runScopeGuardedPull(input: {
  manager: StoreScopeManager;
  baseUrl: string;
  limit: number;
  /** The raw host fetcher — manager.scopedFetch is applied here, not by the caller. */
  fetcher: Fetcher;
  /** The raw host repository — upsertMany is guardWrite-wrapped here. */
  repository: CustomPullRepository;
  /** The raw host checkpoint store — writeCustomPullCheckpoint is guardWrite-wrapped here. */
  checkpointStore: CustomPullCheckpointStore;
  /**
   * Order identifiers with queued local mutations; matching pulled documents
   * are skipped. Pass a provider when the set needs an async read (the usual
   * case) so the read happens under this pull's ticket.
   */
  pendingMutationOrderIds?:
    | ReadonlySet<string | number>
    | (() => Promise<ReadonlySet<string | number>>);
  /**
   * Opt into the server delete channel (F6). Without this, pullCustomBatch never requests deletes,
   * so the forwarded removeDeletedOrders hook stays unreachable and the checkpoint advances past
   * deleted rows leaving stale local orders. Only meaningful when the repository can apply deletes.
   */
  includeDeletes?: boolean;
}): Promise<ScopeGuardedPullResult> {
  let pullResult: { applied: number; hasMore: boolean; dropped: boolean } | null = null;
  const result = await runScopeGuardedOperation({
    manager: input.manager,
    fetcher: input.fetcher,
    produce: async (scopedFetch, guardWrite) => {
      const writes: Array<() => Promise<void>> = [];
      const stageWrite: ScopeBound['guardWrite'] = async (write) => {
        writes.push(write);
        return 'applied';
      };
      pullResult = await runPullUnderBound(input, stageWrite, scopedFetch);
      return { pullResult, writes, guardWrite };
    },
    commit: async (produced) => {
      for (const write of produced.writes) {
        const writeResult = await produced.guardWrite(write);
        if (writeResult === 'dropped') {
          produced.pullResult.dropped = true;
          throw new Error('scope-guarded pull write dropped');
        }
      }
      return produced.pullResult.applied;
    },
  });
  const appliedPull = pullResult as { applied: number; hasMore: boolean; dropped: boolean } | null;
  if (appliedPull?.dropped) {
    return { status: 'dropped', applied: 0, hasMore: null };
  }
  if (result.status !== 'applied') {
    return { ...result, hasMore: null };
  }
  if (appliedPull === null) return { status: 'error', applied: 0, hasMore: null };
  return { status: 'applied', applied: result.applied, hasMore: appliedPull.hasMore };
}

async function runPullUnderBound(
  input: Parameters<typeof runScopeGuardedPull>[0],
  guardWrite: ScopeBound['guardWrite'],
  boundFetcher: Fetcher,
): Promise<{ applied: number; hasMore: boolean; dropped: boolean }> {
  // Shared across both guarded writers: a drop on EITHER write (documents or
  // checkpoint) marks the whole batch as dropped.
  let dropped = false;

  const repo = input.repository;
  const guardedRepository: CustomPullRepository = {
    upsertMany: async (documents) => {
      const result = await guardWrite(() => repo.upsertMany(documents));
      if (result === 'dropped') {
        dropped = true;
      }
    },
    // Forward the optional destructive hooks (F6 deletes, F8 resync reconcile) — guarded like the
    // upsert so a stale ticket drops them too, and only present when the underlying repo has them.
    ...(repo.removeDeletedOrders
      ? {
          removeDeletedOrders: async (wooOrderIds, pending) => {
            const result = await guardWrite(() => repo.removeDeletedOrders!(wooOrderIds, pending));
            if (result === 'dropped') {
              dropped = true;
            }
          },
        }
      : {}),
    ...(repo.resetForResync
      ? {
          resetForResync: async (pending) => {
            const result = await guardWrite(() => repo.resetForResync!(pending));
            if (result === 'dropped') {
              dropped = true;
            }
          },
        }
      : {}),
  };

  const store = input.checkpointStore;
  const guardedCheckpointStore: CustomPullCheckpointStore = {
    readCustomPullCheckpoint: () => store.readCustomPullCheckpoint(),
    writeCustomPullCheckpoint: async (checkpoint) => {
      const result = await guardWrite(() =>
        store.writeCustomPullCheckpoint(checkpoint),
      );
      if (result === 'dropped') {
        dropped = true;
      }
    },
    // Forward the F8 journal-epoch seam so scoped pulls can detect an epoch change (not just the
    // weaker head backstop). The read is a passthrough; the write is guarded like the checkpoint.
    ...(store.readJournalEpoch ? { readJournalEpoch: () => store.readJournalEpoch!() } : {}),
    ...(store.writeJournalEpoch
      ? {
          writeJournalEpoch: async (epoch) => {
            const result = await guardWrite(() => store.writeJournalEpoch!(epoch));
            if (result === 'dropped') {
              dropped = true;
            }
          },
        }
      : {}),
  };

  // Bind every request to the ORIGINAL pull capture (bound.bindFetch:
  // pre-check the captured ticket, then the scoped fetch). A pull whose
  // capture went stale while the pending-ids provider or a checkpoint read was
  // awaiting refuses to start network work instead of burning a request and
  // dropping at the write (codex review). That wiring lives once on the
  // manager, shared with runScopeGuardedOperation (the generic template the
  // push rides).
  // Resolved inside the ticket's lifetime: if a switch lands during this
    // read, the ticket above is already stale and every write below drops.
    const rawPending = input.pendingMutationOrderIds;
    const pendingProvider = typeof rawPending === 'function' ? rawPending : undefined;
    const pendingMutationOrderIds = typeof rawPending === 'function' ? await rawPending() : rawPending;
  try {
    const result = await syncCustomPullBatchIntoRepository({
      baseUrl: input.baseUrl,
      limit: input.limit,
      repository: guardedRepository,
      checkpointStore: guardedCheckpointStore,
      includeDeletes: input.includeDeletes,
      // Re-resolve the pending set for the destructive guards (delete purge + resync reconcile) so a
      // mutation queued mid-pull is protected — the same provider, called again just before those
      // writes. Only when the caller passed a provider (a plain set can't be refreshed).
      ...(pendingProvider ? { refreshPendingMutationOrderIds: pendingProvider } : {}),
      // Every request is bound to the ORIGINAL pull capture — not to a fresh
      // one at send time. If the
      // scope switched while the pending-ids provider or a checkpoint read
      // was awaiting, the stale pull must refuse to start network work
      // rather than burn a request and drop later at the write (codex
      // review). Single signal, no AbortSignal.any — some RN polyfills
      // lack it.
      fetcher: boundFetcher,
      pendingMutationOrderIds,
    });
    return { applied: result.documents, hasMore: result.hasMore, dropped };
  } catch (error) {
    // A guarded-write drop remains the verdict even if later adapter work
    // also throws; all other classification belongs to the generic path.
    if (dropped) return { applied: 0, hasMore: false, dropped: true };
    throw error;
  }
}
