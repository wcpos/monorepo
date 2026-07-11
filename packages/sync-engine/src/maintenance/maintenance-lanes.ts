/**
 * The engine's maintenance lanes (slice 5d, #430 phase 1): the four
 * registry-free loops the web host previously assembled in mountWebSyncHost
 * (lanes 4–7) run inside the engine —
 *
 *  - ORDER OPEN-RECENT WINDOW SEED: orders aren't covered by the change
 *    signal, so the open/recent window is re-seeded on an interval (windowed
 *    lane, one bounded fetch — never a bulk pull; guardrail G3).
 *  - REFERENCE RE-SEED (F11): a completed greedy task is terminal, so a
 *    mid-session category/brand/tag/coupon edit never reaches a running POS
 *    without a periodic re-seed → re-pull → set-difference prune.
 *  - QUERY-TOTAL RETRY SCAN: drains persisted query-total request states
 *    through the host's fetchWooQueryTotal port. Armed ONLY when the port is
 *    provided; fresh cache entries surface as a 'query-total-cache' engine
 *    event so the host can hydrate its UI caches.
 *  - COVERAGE COMPACTION: lease-guarded expiry compaction of the coverage
 *    store, with per-scope lastCompactedAt tracking.
 *
 * Same tick contract as the change-signal/write-drain lanes: offline or
 * mid-lifecycle → skipped; scope-guarded body; errors land on diagnostics and
 * the report, never throw. The persisted scheduler DRAIN (which needs the
 * per-scope fetcher registry) is slice 5e — these lanes only SEED or operate
 * on engine-owned state.
 */

import type { RxDatabase } from 'rxdb';
import type { SyncObserver } from '@woo-rxdb-lab/shared';
import type { StoreScopeManager } from '@woo-rxdb-lab/sync-core';
import { seedOrderFilterSchedulerTask } from '../scheduler/rx-order-scheduler-task-seeder';
import { seedReferenceLanes } from '../scheduler/rx-pos-bootstrap-seeder';
import type { SeedPersistedSchedulerTasksResult } from '../scheduler/rx-scheduler-task-seeder';
import { runQueryTotalRetryRequests } from '../rx-query-total-retry-runner';
import { RxQueryTotalRequestStateRepository } from '../rx-query-total-request-state-repository';
import { RxQueryTotalCacheRepository } from '../collections/rx-query-total-cache-repository';
import type { LocalCoverage } from '../local-coverage/local-coverage';
import { runEngineSchedulerDrain, type SchedulerDrainDatabase } from '../scheduler/engine-scheduler-drain';
import {
  QUERY_TOTAL_FRESH_FOR_MS,
  QUERY_TOTAL_LEASE_FOR_MS,
  QUERY_TOTAL_RETRY_AFTER_MS,
  type QueryTotalCacheEntry,
  type QueryTotalWooRequest,
} from '../scheduler/query-total-requests';

export type MaintenanceLaneName = 'scheduler-drain' | 'order-window-seed' | 'reference-seed' | 'query-total-retry' | 'coverage-compaction' | 'existence-prime' | 'existence-reconcile';

export type MaintenanceLaneReport = {
  lane: MaintenanceLaneName;
  status: 'ran' | 'skipped' | 'error';
  reason?: string;
  error?: string;
};

/** The host port the query-total retry lane drains through (host-executed fetch). */
export type QueryTotalPort = {
  fetchWooQueryTotal: (input: { request: QueryTotalWooRequest; signal?: AbortSignal }) => Promise<number>;
};

export type QueryTotalCacheEvent = { type: 'query-total-cache'; entries: QueryTotalCacheEntry[] };

// The web host's cadence policies move in with the lanes (mountWebSyncHost
// lanes 4–7) — values preserved verbatim.
export const ORDER_OPEN_RECENT_STATUS = 'pending,processing,on-hold';
export const ORDER_OPEN_RECENT_LIMIT = 200;
export const ORDER_OPEN_RECENT_PRIORITY = 600;
export const REFERENCE_REFRESH_DEDUPE_MS = 4 * 60_000;
export const COVERAGE_COMPACTION_INTERVAL_MS = 5 * 60 * 1_000;
export const COVERAGE_COMPACTION_RETAIN_STALE_FOR_MS = 5 * 60 * 1_000;
export const COVERAGE_COMPACTION_LEASE_FOR_MS = 30 * 1_000;
export const COVERAGE_COMPACTION_RETRY_AFTER_MS = 5 * 60 * 1_000;
export const COVERAGE_COMPACTION_MIN_EXPIRED_DOCUMENTS = 1;

type MaintenanceLaneDeps = {
  manager: StoreScopeManager;
  databaseFor: (scopeId: string) => RxDatabase | null;
  coverageFor: (scopeId: string) => LocalCoverage | null;
  /** Namespaced read base (site.syncBaseUrl) — the drain fetchers pull through it. */
  syncBaseUrl: string;
  /** The engine's transport port, threaded into every drain fetcher pull. */
  fetcher: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  connectivity: () => 'online' | 'offline' | 'degraded';
  diagnostics: SyncObserver;
  /** Lease owner recorded on claimed rows — unique per engine instance. */
  ownerId: () => string;
  queryTotal?: QueryTotalPort;
  emitEvent: (event: QueryTotalCacheEvent) => void;
  now?: () => number;
};

export type MaintenanceLane = {
  tick(signal?: AbortSignal): Promise<MaintenanceLaneReport>;
  lastError(): string | null;
};

export type MaintenanceLanes = {
  /** The persisted scheduler drain (slice 5e): fetch queued tasks through the per-collection fetchers. */
  schedulerDrain: MaintenanceLane;
  orderWindowSeed: MaintenanceLane;
  referenceSeed: MaintenanceLane;
  /** Null when the host provided no query-total port — the lane never arms. */
  queryTotalRetry: MaintenanceLane | null;
  coverageCompaction: MaintenanceLane;
  existencePrime: MaintenanceLane;
  existenceReconcile: MaintenanceLane;
};

export function createMaintenanceLanes(deps: MaintenanceLaneDeps): MaintenanceLanes {
  const now = deps.now ?? (() => Date.now());

  /** Shared guard/report/error scaffolding — the body runs scope-bound. */
  function lane(
    name: MaintenanceLaneName,
    body: (
      db: RxDatabase,
      scopeId: string,
      signal: AbortSignal,
      fetcher: MaintenanceLaneDeps['fetcher'],
    ) => Promise<{ summary: string | null; level?: 'info' | 'error' }>,
  ): MaintenanceLane {
    let lastError: string | null = null;
    return {
      tick: async (callerSignal) => {
        if (callerSignal?.aborted) {
          return { lane: name, status: 'skipped', reason: 'aborted' };
        }
        if (deps.connectivity() === 'offline') {
          return { lane: name, status: 'skipped', reason: 'offline' };
        }
        if (deps.manager.activeScope === null) {
          return { lane: name, status: 'skipped', reason: 'no active scope' };
        }
        try {
          const report = await deps.manager.runGuarded<MaintenanceLaneReport>(async (bound) => {
            const db = deps.databaseFor(bound.scopeId);
            if (!db) {
              return { lane: name, status: 'skipped', reason: 'scope database not open' };
            }
            // Caller (host stop) + scope signals combine through a MANUAL
            // controller — AbortSignal.any is unavailable on RN/Expo fetch
            // polyfills (the StoreScopeManager contract). The composite is
            // the lane body's LOOP signal (between-request checks) and the
            // tick side of the per-request merge below.
            const composite = new AbortController();
            const abortComposite = () => composite.abort();
            if (callerSignal?.aborted || bound.signal.aborted) {
              abortComposite();
            } else {
              callerSignal?.addEventListener('abort', abortComposite, { once: true });
              bound.signal.addEventListener('abort', abortComposite, { once: true });
            }
            const signal = composite.signal;
            // Per-request combining lives BELOW bindFetch: scopedFetch hands
            // the ticket signal down as init.signal; merge it with the tick
            // composite and forward ONE signal to the raw transport. The
            // wrapper handed to the lane BODY then absorbs any init.signal
            // its fetch helpers pass (httpGet threads the loop signal) so a
            // bound fetcher never receives one (which would force
            // AbortSignal.any inside scopedFetch — the Hermes bomb).
            const tickFetcher: MaintenanceLaneDeps['fetcher'] = async (url, init) => {
              const ticketSignal = init?.signal;
              const combined = new AbortController();
              const abort = () => combined.abort();
              if (ticketSignal?.aborted || signal.aborted) {
                abort();
              } else {
                ticketSignal?.addEventListener('abort', abort, { once: true });
                signal.addEventListener('abort', abort, { once: true });
              }
              try {
                return await deps.fetcher(url, { ...init, signal: combined.signal });
              } finally {
                ticketSignal?.removeEventListener('abort', abort);
                signal.removeEventListener('abort', abort);
              }
            };
            const rawBoundFetch = bound.bindFetch(tickFetcher);
            const boundFetch: MaintenanceLaneDeps['fetcher'] = (url, init) => {
              const { signal: _absorbed, ...rest } = (init ?? {}) as { signal?: AbortSignal } & Record<string, unknown>;
              return rawBoundFetch(url, rest as { signal?: AbortSignal });
            };
            let wrote;
            try {
              wrote = await bound.guardWrite(async () => {
                const { summary, level } = await body(db, bound.scopeId, signal, boundFetch);
                if (summary !== null) {
                  deps.diagnostics({ type: `${name}.tick`, level: level ?? 'info', message: summary });
                }
              });
            } finally {
              callerSignal?.removeEventListener('abort', abortComposite);
              bound.signal.removeEventListener('abort', abortComposite);
            }
            if (wrote === 'dropped') {
              return { lane: name, status: 'skipped', reason: 'scope moved mid-tick (writes dropped)' };
            }
            return { lane: name, status: 'ran' };
          });
          lastError = null;
          return report;
        } catch (error) {
          if (callerSignal?.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'ScopeStaleError'))) {
            lastError = null;
            return { lane: name, status: 'skipped', reason: 'aborted' };
          }
          const message = error instanceof Error ? error.message : String(error);
          lastError = message;
          deps.diagnostics({ type: `${name}.tick-error`, level: 'error', message });
          return { lane: name, status: 'error', error: message };
        }
      },
      lastError: () => lastError,
    };
  }

  const scopeResolverFor = (db: RxDatabase) => async () => ({
    // The engine scope database carries the scheduler tier (slice 5a recipe).
    getDatabase: () => db as never,
  });

  const seedSummary = (label: string, result: SeedPersistedSchedulerTasksResult): { summary: string | null; level?: 'info' | 'error' } => {
    if (result.inserted === 0 && result.requeued === 0 && result.claimLost === 0) return { summary: null };
    return {
      level: result.claimLost > 0 ? 'error' : 'info',
      summary: `${label}: ${result.inserted} inserted, ${result.requeued} requeued${result.claimLost > 0 ? `, ${result.claimLost} claim lost` : ''}`,
    };
  };

  const schedulerDrain = lane('scheduler-drain', async (db, _scopeId, signal, fetcher) => {
    const coverage = deps.coverageFor(_scopeId);
    if (!coverage) return { summary: null };
    const result = await runEngineSchedulerDrain({
      db: db as unknown as SchedulerDrainDatabase,
      coverage,
      baseUrl: deps.syncBaseUrl,
      ownerId: deps.ownerId(),
      fetcher,
      signal,
      ...(deps.now !== undefined ? { nowMs: deps.now() } : {}),
    });
    const hasActivity = result.totalRequests > 0 || result.succeeded > 0 || result.failed > 0
      || result.claimLost > 0 || result.completionLost > 0 || result.failureLost > 0 || result.renewalLost > 0;
    if (!hasActivity) return { summary: null };
    deps.diagnostics({
      type: 'queue.scheduler.drain',
      level: result.failed > 0 || result.completionLost > 0 || result.failureLost > 0 || result.renewalLost > 0 ? 'error' : 'info',
      fields: {
        scanned: result.scanned,
        succeeded: result.succeeded,
        failed: result.failed,
        claimLost: result.claimLost,
        completionLost: result.completionLost,
        failureLost: result.failureLost,
        renewalLost: result.renewalLost,
        documents: result.totalDocuments,
        requests: result.totalRequests,
      },
    });
    return {
      level: result.failed > 0 || result.completionLost > 0 || result.failureLost > 0 || result.renewalLost > 0 ? 'error' : 'info',
      summary: `Scheduler drain: ${result.succeeded} succeeded, ${result.failed} failed, ${result.totalRequests} requests, ${result.totalDocuments} documents`,
    };
  });

  const orderWindowSeed = lane('order-window-seed', async (db) => {
    const result = await seedOrderFilterSchedulerTask({
      status: ORDER_OPEN_RECENT_STATUS,
      search: '',
      limit: ORDER_OPEN_RECENT_LIMIT,
      priority: ORDER_OPEN_RECENT_PRIORITY,
      getRepository: scopeResolverFor(db),
      // The injected clock reaches the SEED's dedupe check too — the drain
      // already ticked on deps.now; a seed on Date.now() would judge the
      // completed-dedupe window on a different clock (host adoption #430:
      // manual-mode harnesses advance one deterministic clock).
      ...(deps.now !== undefined ? { nowMs: deps.now() } : {}),
    });
    return seedSummary('Orders open-recent window seed (windowed, not a bulk pull)', result);
  });

  const referenceSeed = lane('reference-seed', async (db) => {
    const result = await seedReferenceLanes({
      completedDedupeForMs: REFERENCE_REFRESH_DEDUPE_MS,
      getRepository: scopeResolverFor(db),
      // Same one-clock rule as the order window seed above.
      ...(deps.now !== undefined ? { nowMs: deps.now() } : {}),
    });
    return seedSummary('Reference refresh (categories + brands + tags + coupons)', result);
  });

  const queryTotal = deps.queryTotal;
  const queryTotalRetry = queryTotal
    ? lane('query-total-retry', async (db, _scopeId, signal) => {
      const nowMs = now();
      const result = await runQueryTotalRetryRequests({
        stateRepository: new RxQueryTotalRequestStateRepository(db as never),
        cacheRepository: new RxQueryTotalCacheRepository(db as never),
        fetchWooQueryTotal: ({ request, signal: requestSignal }) => queryTotal.fetchWooQueryTotal({
          request,
          ...(requestSignal !== undefined ? { signal: requestSignal } : {}),
        }),
        signal,
        ownerId: deps.ownerId(),
        nowMs,
        getNowMs: now,
        leaseForMs: QUERY_TOTAL_LEASE_FOR_MS,
        retryAfterMs: QUERY_TOTAL_RETRY_AFTER_MS,
        freshForMs: QUERY_TOTAL_FRESH_FOR_MS,
      });
      if (result.cacheEntries.length > 0) {
        deps.emitEvent({ type: 'query-total-cache', entries: result.cacheEntries });
      }
      if (result.succeeded === 0 && result.failed === 0 && result.claimLost === 0 && result.skippedMissingRequest === 0) {
        return { summary: null };
      }
      return {
        summary: `Query total retry scan: ${result.succeeded} succeeded, ${result.failed} failed, ${result.claimLost} claim lost, ${result.skippedMissingRequest} missing request metadata`,
      };
    })
    : null;

  // Per SCOPE, not per engine: switching A→B→A must not let B's compaction
  // clock suppress A's (they are different databases).
  const lastCompactedAtByScope = new Map<string, number>();
  const coverageCompaction = lane('coverage-compaction', async (db, scopeId) => {
    const nowMs = now();
    const coverage = deps.coverageFor(scopeId);
    if (!coverage) return { summary: null };
    const result = await coverage.maintainCompaction({
      ownerId: deps.ownerId(),
      intervalMs: COVERAGE_COMPACTION_INTERVAL_MS,
      minExpiredDocuments: COVERAGE_COMPACTION_MIN_EXPIRED_DOCUMENTS,
      lastCompactedAtMs: lastCompactedAtByScope.get(scopeId) ?? null,
      leaseTtlMs: COVERAGE_COMPACTION_LEASE_FOR_MS,
      failureBackoffMs: COVERAGE_COMPACTION_RETRY_AFTER_MS,
    });
    if (result.status === 'compacted') {
      lastCompactedAtByScope.set(scopeId, nowMs);
      return { summary: `Coverage compaction: compacted at ${nowMs}` };
    }
    return { summary: null };
  });

  const existencePrime = lane('existence-prime', async (_db, scopeId, _signal, fetcher) => {
    const startedAt = now();
    const coverage = deps.coverageFor(scopeId);
    if (!coverage) return { summary: null };
    const result = await coverage.primeManifest({
      fetcher: (url, init) => fetcher(url, init?.signal ? { signal: init.signal } : undefined),
      syncBaseUrl: deps.syncBaseUrl,
    });
    deps.diagnostics({ type: 'coverage.existence-prime', level: 'info', fields: { ...result, durationMs: now() - startedAt } });
    return { summary: `Existence prime: ${result.products} products/variations, ${result.customers} customers, ${result.orders} orders` };
  });

  const existenceReconcile = lane('existence-reconcile', async (_db, scopeId, signal, fetcher) => {
    const startedAt = now();
    const coverage = deps.coverageFor(scopeId);
    if (!coverage) return { summary: null };
    const result = await coverage.reconcilePass(signal, fetcher);
    deps.diagnostics({ type: 'coverage.existence-reconcile', level: 'info', fields: { ...result, durationMs: now() - startedAt } });
    return { summary: `Existence reconcile: ${result.buckets} buckets, ${result.pruned} pruned, ${result.pulled} pulled, ${result.repulled} repulled, ${result.skippedDirty} dirty skipped` };
  });

  return { schedulerDrain, orderWindowSeed, referenceSeed, queryTotalRetry, coverageCompaction, existencePrime, existenceReconcile };
}
