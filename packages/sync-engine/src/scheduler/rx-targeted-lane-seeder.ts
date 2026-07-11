/**
 * Generic TARGETED-RECORD scheduler-lane seeder — the shared template behind the
 * per-collection on-demand id seeders (`seedTargetedProductSchedulerTask`,
 * `seedTargetedOrderSchedulerTask`, and the planned `variations` lane that
 * rxChangeSignalReplicationTick.ts defers today).
 *
 * Every targeted lane does the same thing and differs only in five
 * collection-specific values, captured by `TargetedLaneDescriptor`:
 *
 *   normalize ids (dedup + ascending sort, positive-integer guard)
 *     → chunk at the scheduler key-length AND batch-size limits
 *     → build one FetchTask per chunk (`<keyPrefix>:ids:<ids>` queryKey,
 *       `<requirementPrefix>.targeted.<ids>` requirementId, `documentId(id)` doc ids)
 *     → seedPersistedSchedulerTasks (completed-dedupe semantics preserved verbatim —
 *       a NON-POSITIVE completedDedupeForMs disables completed-dedupe; see
 *       rxSchedulerTaskSeeder.ts).
 *
 * Adding a collection lane is a descriptor, not a copy.
 */

import type { SchedulerScopeResolver } from './scheduler-scope-resolver';
import { seedPersistedSchedulerTasks, type SeedPersistedSchedulerTasksResult } from './rx-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import { schedulerTaskStateSchema } from './scheduler-task-state-schema';

const SCHEDULER_TASK_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;

/** The per-collection values that distinguish one targeted-record lane from another. */
export type TargetedLaneDescriptor = {
  /** Collection the seeded FetchTasks belong to (e.g. `'products'`, `'orders'`). */
  collection: string;
  /** Singular noun used in id/batch validation messages (e.g. `'product'`, `'order'`). */
  idLabel: string;
  /** queryKey / taskId prefix → `<keyPrefix>:ids:<ids>` (e.g. `'products'`). */
  keyPrefix: string;
  /** requirementId prefix → `<requirementPrefix>.targeted.<ids>` (e.g. `'products'`). */
  requirementPrefix: string;
  /** Builds a Woo document id from a numeric record id (e.g. `id => `woo-product:${id}``). */
  documentId: (id: number) => string;
  /** Default scheduler priority when the caller does not override it. */
  defaultPriority: number;
  /** Default per-task batch size when the caller does not override it. */
  defaultBatchSize: number;
  /** Default completed-dedupe window (ms); a non-positive value disables completed-dedupe. */
  defaultCompletedDedupeForMs: number;
};

export type SeedTargetedLaneInput = {
  ids: number[];
  priority?: number;
  batchSize?: number;
  completedDedupeForMs?: number;
  nowMs?: number;
  getRepository: SchedulerScopeResolver;
  /** Opt into in-flight coalescing (#318) — set by change-signal targeted seeders. */
  coalesceInFlight?: boolean;
};

function normalizedLaneIds(descriptor: TargetedLaneDescriptor, ids: number[]): number[] {
  const normalized = [...new Set(ids.map((id) => {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Targeted ${descriptor.idLabel} scheduler task requires positive integer ${descriptor.idLabel} ids: ${id}`);
    }
    return id;
  }))].sort((left, right) => left - right);
  if (normalized.length === 0) {
    throw new Error(`Targeted ${descriptor.idLabel} scheduler task requires at least one ${descriptor.idLabel} id`);
  }
  return normalized;
}

function laneKeyParts(descriptor: TargetedLaneDescriptor, ids: number[]): { idsPart: string; requirementId: string; queryKey: string } {
  const idsPart = ids.join(',');
  return {
    idsPart,
    requirementId: `${descriptor.requirementPrefix}.targeted.${idsPart}`,
    queryKey: `${descriptor.keyPrefix}:ids:${idsPart}`,
  };
}

function chunkLaneIds(descriptor: TargetedLaneDescriptor, ids: number[], batchSize: number): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];

  for (const id of ids) {
    const candidate = [...current, id];
    const { requirementId, queryKey } = laneKeyParts(descriptor, candidate);
    if (
      current.length > 0
      && (candidate.length > batchSize || requirementId.length > SCHEDULER_TASK_KEY_MAX_LENGTH || queryKey.length > SCHEDULER_TASK_KEY_MAX_LENGTH)
    ) {
      chunks.push(current);
      current = [id];
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function laneBatchSize(descriptor: TargetedLaneDescriptor, batchSize?: number): number {
  const normalized = batchSize ?? descriptor.defaultBatchSize;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error(`Targeted ${descriptor.idLabel} scheduler task batch size must be a positive integer`);
  }
  return normalized;
}

export async function seedTargetedLane(descriptor: TargetedLaneDescriptor, input: SeedTargetedLaneInput): Promise<SeedPersistedSchedulerTasksResult> {
  const ids = normalizedLaneIds(descriptor, input.ids);
  const batchSize = laneBatchSize(descriptor, input.batchSize);
  const repository = await input.getRepository();
  const schedulerRepository = new RxSchedulerTaskStateRepository(repository.getDatabase());
  const nowMs = input.nowMs ?? Date.now();

  return seedPersistedSchedulerTasks({
    repository: schedulerRepository,
    tasks: chunkLaneIds(descriptor, ids, batchSize).map((chunk) => {
      const { idsPart, requirementId, queryKey } = laneKeyParts(descriptor, chunk);
      return {
        id: `${descriptor.keyPrefix}:ids:${idsPart}:on-demand`,
        requirementId,
        collection: descriptor.collection,
        queryKey,
        ids: chunk.map((id) => descriptor.documentId(id)),
        // The validated numeric ids ride alongside the document keys so the fetcher
        // reads them directly — decoupled from the key encoding (uuid-ready).
        wooIds: chunk,
        limit: batchSize,
        priority: input.priority ?? descriptor.defaultPriority,
        mode: 'on-demand',
      };
    }),
    nowMs,
    completedDedupeForMs: input.completedDedupeForMs ?? descriptor.defaultCompletedDedupeForMs,
    coalesceInFlight: input.coalesceInFlight ?? false,
  });
}
