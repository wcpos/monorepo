/**
 * The demand plane (facade slice 4): `require(requirement) → RequirementHandle`
 * — a component-declared data requirement as data (CONTEXT.md), resolved
 * coverage-aware. MINIMAL-BUT-HONEST scope (recorded in the PR): coverage
 * evidence is LOCAL RECORD PRESENCE (the only honest evidence the engine owns
 * — the persisted coverage store stays web-side until host adoption), and the
 * fetch queue is in-memory priority-ordered (the durable scheduler tier is
 * deferred with it). Concretely:
 *
 *  - `targeted-records` (targeted-shape collections, wooIds required): missing
 *    ids are pulled directly through the descriptor machinery; all-present
 *    resolves serve-local WITHOUT a fetch.
 *  - `refresh` (greedy-prunable / upsert-refresh collections): one re-pull of
 *    the small collection (that IS the lane's coverage contract).
 *  - A higher-priority requirement enqueued behind a lower one runs FIRST
 *    (the queue re-sorts on every enqueue; only an explicit release aborts
 *    in-flight foreground scheduler work).
 *  - `release()` removes queued work or aborts an active foreground drain;
 *    either way `ready` resolves `{ action: 'released' }`.
 *
 * Query-shaped requirements over TARGETED collections without ids are caller
 * misuse here (exception): resolving them honestly needs the persisted
 * coverage/scheduler tier this slice defers.
 */

/**
 * Durability follows the requirement's ANCHORING, not its collection:
 * UI-declared requirements are re-declared on every render (self-healing →
 * the in-memory queue is correct); workflow-anchored requirements are one-shot
 * with nothing re-declaring them (→ the durable persisted queue — exactly the
 * orders paths). Convergence trigger: a requirement kind that becomes
 * workflow-anchored moves to the durable queue per-kind.
 */

import type { RxCollection, RxDatabase } from 'rxdb';
import type { SyncObserver } from '@woo-rxdb-lab/shared';
import type { Fetcher, StoreScopeManager } from '@woo-rxdb-lab/sync-core';
import {
  COLLECTION_DESCRIPTORS,
  type GreedyPrunableDescriptor,
  type UpsertRefreshDescriptor,
} from './collections/collection-descriptors';
import { pullTargetedByIds, refreshCollection } from './change-signal/change-signal-handlers';
import type { EngineSourceFetcher } from './change-signal/change-signal-source';
import type { SyncCollectionName } from './collections/engine-collections';
import { seedOrderFilterSchedulerTask, seedOrderSchedulerTasks, seedTargetedOrderSchedulerTask } from './scheduler/rx-order-scheduler-task-seeder';
import { parseOrderBrowserSchedulerDescriptor } from './scheduler/order-browser-scheduler-descriptor';
import {
  ORDER_SCHEDULER_LEASE_FOR_MS,
  runEngineSchedulerDrain,
  type SchedulerDrainDatabase,
} from './scheduler/engine-scheduler-drain';
import type { PersistedSchedulerTaskRunnerResult } from './scheduler/rx-scheduler-task-runner';
import type { LocalCoverage } from './local-coverage/local-coverage';

const ACTIVE_ORDER_WAIT_TIMEOUT_MS = ORDER_SCHEDULER_LEASE_FOR_MS * 2;

export type EngineRequirement = {
  /** Caller-chosen id (diagnostics only — requirements are not deduped here). */
  id: string;
  collection: SyncCollectionName;
  kind: 'targeted-records' | 'query' | 'refresh';
  /** Required for 'targeted-records'. */
  wooIds?: number[];
  /** Higher runs first. Default 500 (the web scheduler's browse-lane band). */
  priority?: number;
  /** Re-fetch targeted records even when they are already resident. Used by
   * explicit refresh/re-anchor flows; ordinary requirements stay coverage-aware. */
  forceRefresh?: boolean;
  /** Query descriptor for kind:'query'. */
  queryKey?: string;
  /** Page size for an orders refresh. */
  limit?: number;
};

export type CoverageOutcome = {
  action: 'serve-local' | 'fetched' | 'released';
  missingRecordIds: number[];
  reason: string;
  documents?: number;
  requests?: number;
};

export type RequirementHandle = {
  ready: Promise<CoverageOutcome>;
  release(): void;
};

export type RequirePlaneDeps = {
  /** Settles once the initial scope open settled — require() before ready
   * must queue, not reject with 'no active scope'. */
  awaitReady: () => Promise<void>;
  manager: StoreScopeManager;
  databaseFor: (scopeId: string) => RxDatabase | null;
  coverageFor: (scopeId: string) => LocalCoverage | null;
  fetcher: EngineSourceFetcher;
  syncBaseUrl: string;
  diagnostics: SyncObserver;
  now?: () => number;
};

type QueuedRequirement = {
  requirement: EngineRequirement;
  priority: number;
  seq: number;
  resolve: (outcome: CoverageOutcome) => void;
  reject: (error: unknown) => void;
  released: boolean;
  started: boolean;
  abortController: AbortController;
};

export type RequirePlane = {
  require(requirement: EngineRequirement): RequirementHandle;
};

export function createRequirePlane(deps: RequirePlaneDeps): RequirePlane {
  const queue: QueuedRequirement[] = [];
  let seq = 0;
  let running = false;
  const progressObserver = (requirement: EngineRequirement) => {
    let documents = 0;
    let requests = 0;
    return (progress: { collection: string; documents: number; requests: number }): void => {
      deps.diagnostics({
        type: 'queue.drain.progress',
        level: 'info',
        collection: progress.collection,
        fields: {
          requirementId: requirement.id,
          documents: progress.documents - documents,
          requests: progress.requests - requests,
        },
      });
      documents = progress.documents;
      requests = progress.requests;
    };
  };

  const descriptorFor = (collection: SyncCollectionName) =>
    COLLECTION_DESCRIPTORS.find((d) => d.collection === collection);

  const emptyDrainResult = (): PersistedSchedulerTaskRunnerResult => ({
    scanned: 0,
    claimLost: 0,
    completionLost: 0,
    succeeded: 0,
    coalescedReruns: 0,
    failed: 0,
    failureLost: 0,
    renewalLost: 0,
    totalDocuments: 0,
    totalRequests: 0,
  });

  const drainLostOutcomeCount = (result: PersistedSchedulerTaskRunnerResult): number =>
    result.claimLost + result.completionLost + result.failureLost + result.renewalLost;

  const releasedOutcome = (): CoverageOutcome => ({
    action: 'released',
    missingRecordIds: [],
    reason: 'released during drain',
  });

  async function missingWooIds(
    db: RxDatabase,
    d: { collection: SyncCollectionName; wooIdField: string },
    wooIds: number[],
  ): Promise<number[]> {
    const collection = db.collections[d.collection] as RxCollection;
    const docs = await collection.find({ selector: { [d.wooIdField]: { $in: wooIds } } as never }).exec();
    const present = new Set(docs.map((doc) => Number((doc.toJSON() as Record<string, unknown>)[d.wooIdField])));
    return wooIds.filter((id) => !present.has(id));
  }

  async function executeOne(item: QueuedRequirement): Promise<CoverageOutcome> {
    await deps.awaitReady();
    return deps.manager.runGuarded(async (bound) => {
      const database = deps.databaseFor(bound.scopeId);
      if (!database) throw new Error('require: scope database not open');
      const coverage = deps.coverageFor(bound.scopeId);
      if (!coverage) throw new Error('require: local coverage not open');
      const descriptor = descriptorFor(item.requirement.collection);
      if (!descriptor) throw new Error(`require: unknown collection "${item.requirement.collection}"`);
      // Combine the requirement and scheduler-ticket signals below bindFetch,
      // then absorb helper-provided signals above it. Passing init.signal to a
      // scope-bound fetcher forces AbortSignal.any, which Hermes lacks.
      const requirementFetcher: Fetcher = async (url, init) => {
        const ticketSignal = init?.signal;
        const combined = new AbortController();
        const abort = () => combined.abort();
        if (ticketSignal?.aborted || item.abortController.signal.aborted) abort();
        else {
          ticketSignal?.addEventListener('abort', abort, { once: true });
          item.abortController.signal.addEventListener('abort', abort, { once: true });
        }
        try {
          return await (deps.fetcher as Fetcher)(url, { ...init, signal: combined.signal });
        } finally {
          ticketSignal?.removeEventListener('abort', abort);
          item.abortController.signal.removeEventListener('abort', abort);
        }
      };
      const rawBoundFetch = bound.bindFetch(requirementFetcher);
      const boundFetch: Fetcher = (url, init) => {
        const { signal: _absorbed, ...rest } = (init ?? {}) as { signal?: AbortSignal } & Record<string, unknown>;
        return rawBoundFetch(url, rest as never);
      };
      const ctx = {
        database,
        fetch: boundFetch,
        syncBaseUrl: deps.syncBaseUrl,
        persistState: async () => undefined,
        log: (line: string) => deps.diagnostics({ type: 'coverage.require.log', level: 'debug', message: line }),
        observe: deps.diagnostics,
      };

      if (item.requirement.collection === 'orders' && item.requirement.kind === 'query') {
        const decision = parseOrderBrowserSchedulerDescriptor(item.requirement.queryKey ?? '');
        if (!decision || 'skipReason' in decision) {
          throw new Error(`require: unsupported order query (${decision?.skipReason ?? 'missing queryKey'})`);
        }
        let drainResult = emptyDrainResult();
        let skippedActive = false;
        const applied = await bound.guardWrite(async () => {
          const seedResult = await seedOrderFilterSchedulerTask({
            ...decision.descriptor,
            completedDedupeForMs: item.requirement.forceRefresh ? 0 : undefined,
            getRepository: async () => ({ getDatabase: () => database as never }),
          });
          if (seedResult.skippedActive > 0) {
            skippedActive = true;
            return;
          }
          drainResult = await runEngineSchedulerDrain({
            db: database as unknown as SchedulerDrainDatabase,
            coverage,
            baseUrl: deps.syncBaseUrl,
            ownerId: 'require-plane',
            fetcher: boundFetch as never,
            signal: item.abortController.signal,
            onProgress: progressObserver(item.requirement),
          });
        });
        if (applied === 'dropped') throw new Error('require: scope moved mid-query (writes dropped)');
        if (skippedActive) return { action: 'released', missingRecordIds: [], reason: 'order query refresh already in progress' };
        if (drainResult.failed > 0) throw new Error(`require: scheduler drain failed ${drainResult.failed} task(s)`);
        const lost = drainLostOutcomeCount(drainResult);
        // Claim loss means another owner is completing the durable task. Like
        // skippedActive, it releases this caller rather than reporting failure.
        if (lost > 0) return { action: 'released', missingRecordIds: [], reason: 'claim lost to another owner', documents: drainResult.totalDocuments, requests: drainResult.totalRequests };
        return { action: 'fetched', missingRecordIds: [], reason: `drained order query ${decision.descriptor.queryKey}`, documents: drainResult.totalDocuments, requests: drainResult.totalRequests };
      }

      if (item.requirement.collection === 'orders' && item.requirement.kind === 'refresh') {
        let drainResult = emptyDrainResult();
        let skippedActive = false;
        const applied = await bound.guardWrite(async () => {
          const seedResult = await seedOrderSchedulerTasks({
            perPage: item.requirement.limit ?? 250,
            priority: item.priority,
            completedDedupeForMs: item.requirement.forceRefresh ? 0 : undefined,
            getRepository: async () => ({ getDatabase: () => database as never }),
          });
          if (seedResult.skippedActive > 0) {
            skippedActive = true;
            return;
          }
          drainResult = await runEngineSchedulerDrain({
            db: database as unknown as SchedulerDrainDatabase,
            coverage,
            baseUrl: deps.syncBaseUrl,
            ownerId: 'require-plane',
            fetcher: boundFetch as never,
            signal: item.abortController.signal,
            maxRequestsPerTask: Number.POSITIVE_INFINITY,
            onProgress: progressObserver(item.requirement),
          });
        });
        if (applied === 'dropped') throw new Error('require: scope moved mid-refresh (writes dropped)');
        if (skippedActive) return { action: 'released', missingRecordIds: [], reason: 'full order refresh already in progress' };
        if (drainResult.failed > 0) throw new Error(`require: scheduler drain failed ${drainResult.failed} task(s)`);
        const lost = drainLostOutcomeCount(drainResult);
        // Claim loss means another owner is completing the durable task. Like
        // skippedActive, it releases this caller rather than reporting failure.
        if (lost > 0) return { action: 'released', missingRecordIds: [], reason: 'claim lost to another owner', documents: drainResult.totalDocuments, requests: drainResult.totalRequests };
        return { action: 'fetched', missingRecordIds: [], reason: 'drained full order refresh', documents: drainResult.totalDocuments, requests: drainResult.totalRequests };
      }

      if (item.requirement.kind === 'targeted-records' && item.requirement.collection === 'orders') {
        // Orders (slice 5f): the DURABLE path — a persisted targeted task the
        // scheduler drain completes, so a crash mid-fetch never loses the
        // requirement (the drain lane finishes it later). Presence gate first.
        const wooIds = item.requirement.wooIds ?? [];
        if (wooIds.length === 0) {
          throw new Error("require: 'targeted-records' needs wooIds");
        }
        const orderWooIdLookup = { collection: 'orders' as const, wooIdField: 'wooOrderId' };
        const missing = item.requirement.forceRefresh
          ? wooIds
          : await missingWooIds(database, orderWooIdLookup, wooIds);
        if (missing.length === 0) {
          return { action: 'serve-local' as const, missingRecordIds: [], reason: 'every required record is resident' };
        }
        const now = deps.now ?? Date.now;
        const activeOrderDeadlineMs = now() + ACTIVE_ORDER_WAIT_TIMEOUT_MS;
        const remainingActiveOrderWaitMs = (remainingCount: number): number => {
          const waitMs = activeOrderDeadlineMs - now();
          if (waitMs <= 0) {
            throw new Error(`require: timed out waiting for an active order task after ${ACTIVE_ORDER_WAIT_TIMEOUT_MS}ms; ${remainingCount} required order(s) remain absent`);
          }
          return waitMs;
        };
        let remaining = missing;
        let activeOrderWaitStep = 0;
        const activeOrderWaitStepsMs = [50, 250, 1_000] as const;
        while (remaining.length > 0) {
          if (item.abortController.signal.aborted) return releasedOutcome();
          remainingActiveOrderWaitMs(remaining.length);
          let skippedActive = 0;
          let failed = 0;
          const applied = await bound.guardWrite(async () => {
            const nowMs = now();
            const seedResult = await seedTargetedOrderSchedulerTask({
              orderIds: remaining,
              priority: item.priority,
              completedDedupeForMs: 0,
              nowMs,
              getRepository: async () => ({ getDatabase: () => database as never }),
            });
            skippedActive = seedResult.skippedActive;
            const drainResult = await runEngineSchedulerDrain({
              db: database as unknown as SchedulerDrainDatabase,
              coverage,
              baseUrl: deps.syncBaseUrl,
              ownerId: 'require-plane',
              fetcher: boundFetch as never,
              signal: item.abortController.signal,
              nowMs,
              onProgress: progressObserver(item.requirement),
            });
            failed = drainResult.failed;
          });
          if (applied === 'dropped') {
            throw new Error('require: scope moved mid-pull — writes dropped');
          }
          if (item.abortController.signal.aborted) return releasedOutcome();
          remaining = await missingWooIds(database, orderWooIdLookup, remaining);
          if (remaining.length === 0) break;
          if (failed > 0) {
            throw new Error(`require: scheduler drain failed ${failed} task(s); ${remaining.length} required order(s) remain absent`);
          }
          if (skippedActive === 0) {
            throw new Error(`require: scheduler drain completed but ${remaining.length} required order(s) remain absent`);
          }
          const backoffMs = activeOrderWaitStepsMs[Math.min(activeOrderWaitStep, activeOrderWaitStepsMs.length - 1)];
          activeOrderWaitStep += 1;
          const waitMs = Math.min(backoffMs, remainingActiveOrderWaitMs(remaining.length));
          await new Promise<void>((resolve) => {
            const signal = item.abortController.signal;
            let timer: ReturnType<typeof setTimeout>;
            const settle = (): void => {
              clearTimeout(timer);
              signal.removeEventListener('abort', settle);
              resolve();
            };
            timer = setTimeout(settle, waitMs);
            signal.addEventListener('abort', settle);
            if (signal.aborted) settle();
          });
          if (item.abortController.signal.aborted) return releasedOutcome();
          if (!bound.isCurrent()) {
            throw new Error('require: scope moved while waiting for an active order task');
          }
          remaining = await missingWooIds(database, orderWooIdLookup, remaining);
        }
        return { action: 'fetched' as const, missingRecordIds: missing, reason: `pulled ${missing.length} missing order(s) via the persisted scheduler` };
      }

      if (item.requirement.kind === 'targeted-records') {
        if (descriptor.shape !== 'targeted') {
          throw new Error(`require: 'targeted-records' needs a targeted collection; "${descriptor.collection}" is ${descriptor.shape}`);
        }
        const wooIds = item.requirement.wooIds ?? [];
        if (wooIds.length === 0) {
          throw new Error("require: 'targeted-records' needs wooIds");
        }
        const missing = item.requirement.forceRefresh
          ? wooIds
          : await missingWooIds(database, descriptor, wooIds);
        if (missing.length === 0) {
          return { action: 'serve-local' as const, missingRecordIds: [], reason: 'every required record is resident' };
        }
        if (item.abortController.signal.aborted) return releasedOutcome();
        const applied = await bound.guardWrite(async () => {
          await pullTargetedByIds(ctx, descriptor, missing);
        });
        if (applied === 'dropped') {
          throw new Error('require: scope moved mid-pull — writes dropped');
        }
        if (item.abortController.signal.aborted) return releasedOutcome();
        return { action: 'fetched' as const, missingRecordIds: missing, reason: `pulled ${missing.length} missing record(s)` };
      }

      // kind === 'refresh'
      if (descriptor.shape !== 'greedy-prunable' && descriptor.shape !== 'upsert-refresh') {
        throw new Error(`require: 'refresh' covers greedy-prunable/upsert-refresh collections; "${descriptor.collection}" is ${descriptor.shape}`);
      }
      if (item.abortController.signal.aborted) return releasedOutcome();
      const applied = await bound.guardWrite(async () => {
        await refreshCollection(ctx, descriptor as GreedyPrunableDescriptor | UpsertRefreshDescriptor);
      });
      if (applied === 'dropped') {
        throw new Error('require: scope moved mid-refresh — writes dropped');
      }
      if (item.abortController.signal.aborted) return releasedOutcome();
      return { action: 'fetched' as const, missingRecordIds: [], reason: `refreshed ${descriptor.collection}` };
    });
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (;;) {
        // Re-sort each pass: a higher-priority requirement enqueued while this
        // pump was busy PREEMPTS everything still queued.
        queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
        const next = queue.shift();
        if (!next) return;
        if (next.released) {
          continue; // release() already resolved it — just drop the entry.
        }
        next.started = true;
        const startedAt = Date.now();
        try {
          const outcome = await executeOne(next);
          deps.diagnostics({
            type: 'coverage.require.outcome',
            level: 'info',
            collection: next.requirement.collection,
            fields: {
              requirementId: next.requirement.id,
              kind: next.requirement.kind,
              action: outcome.action,
              documents: outcome.documents ?? 0,
              requests: outcome.requests ?? 0,
              durationMs: Date.now() - startedAt,
            },
          });
          if (outcome.action !== 'released') {
            deps.diagnostics({
              type: outcome.action === 'serve-local' ? 'coverage.gate.hit' : 'coverage.gate.miss',
              level: 'debug',
              collection: next.requirement.collection,
              fields: { requirementId: next.requirement.id, kind: next.requirement.kind },
            });
          }
          next.resolve(outcome);
        } catch (error) {
          const message = error instanceof Error && error.message.startsWith('require: ')
            ? error.message
            : error instanceof Error ? error.name : 'UnknownError';
          deps.diagnostics({
            type: 'coverage.require.error',
            level: 'error',
            collection: next.requirement.collection,
            message,
            fields: { requirementId: next.requirement.id, kind: next.requirement.kind, durationMs: Date.now() - startedAt },
          });
          next.reject(error);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    require: (requirement) => {
      let entry: QueuedRequirement;
      const ready = new Promise<CoverageOutcome>((resolve, reject) => {
        entry = {
          requirement,
          priority: requirement.priority ?? 500,
          seq: (seq += 1),
          resolve,
          reject,
          released: false,
          started: false,
          abortController: new AbortController(),
        };
      });
      queue.push(entry!);
      void pump();
      return {
        ready,
        release: () => {
          if (entry.released) return;
          entry.released = true;
          entry.abortController.abort(new DOMException('Requirement released during drain', 'AbortError'));
          // Resolve NOW — a released (unmounting) caller must not wait for
          // whatever is in flight ahead of it. The pump drops the entry later.
          entry.resolve({
            action: 'released',
            missingRecordIds: [],
            reason: entry.started ? 'released during drain' : 'released before execution',
          });
        },
      };
    },
  };
}
