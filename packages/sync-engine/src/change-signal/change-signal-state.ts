/**
 * Package-private engine-state (de)serialization (facade slice 3) — ported from
 * the web host's former changeSignalStatePersistence (deleted at #430 phase 2). The
 * hybrid engine's baselineDigests is a Map (JSON cannot hold one), so the blob
 * stores entries; a malformed blob deserializes to null and the lane falls back
 * to prime-to-head instead of crashing every tick. Persistence I/O lives in the
 * lane (through the engine kv / checkpoints seam), not here.
 */

import type { ReplicationActions } from '@woo-rxdb-lab/sync-core';

type EngineState = ReplicationActions['nextState'];

type BaselineEntries = Array<[string, EngineState['baselineDigests'] extends Map<string, infer V> ? V : never]>;

type SerializedEngineState = {
  cursor: EngineState['cursor'];
  baselineDigests: BaselineEntries;
  configBaseline?: EngineState['configBaseline'];
};

/** What `createHybridChangeSignalEngine` needs to resume where the loop left off. */
export type RestoredEngineState = {
  initialCursor: EngineState['cursor'];
  baselineDigests: EngineState['baselineDigests'];
  configBaseline?: EngineState['configBaseline'];
};

export function serializeChangeSignalState(state: EngineState): string {
  const serialized: SerializedEngineState = {
    cursor: state.cursor,
    baselineDigests: Array.from(state.baselineDigests.entries()) as BaselineEntries,
    ...(state.configBaseline !== undefined ? { configBaseline: state.configBaseline } : {}),
  };
  return JSON.stringify(serialized);
}

/** A persisted baseline value must round-trip to a real BucketDigest — otherwise
 * the engine would dereference `digest.detector` while cloning the Map and crash
 * every first tick instead of taking the malformed-blob fallback. */
function isValidBucketDigest(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { detector?: unknown; count?: unknown; digest?: unknown; match?: unknown; checksum?: unknown; ids?: unknown };
  if (v.detector === 'hash-checksum') {
    // Accept a legacy NUMERIC digest (pre-64-bit persisted state) as well as the current string — it's
    // migrated to a string on restore (below). Rejecting it would drop the whole blob → primeToHead()
    // → the cursor jumps to head and any changes made while offline during the upgrade are skipped.
    return typeof v.count === 'number'
      && (typeof v.digest === 'string' || typeof v.digest === 'number')
      && typeof v.match === 'boolean';
  }
  if (v.detector === 'range-checksum') {
    return typeof v.count === 'number' && typeof v.checksum === 'string'
      && (v.ids === undefined || (Array.isArray(v.ids) && v.ids.every((id) => Number.isSafeInteger(id))));
  }
  return false;
}

function isValidBaselineEntry(entry: unknown): boolean {
  return Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && isValidBucketDigest(entry[1]);
}

/** Migrate a legacy NUMERIC hash-checksum digest to a string (64-bit digests are strings — ADR 0014 M1). */
function migrateBaselineEntry([key, digest]: [string, Record<string, unknown>]): [string, Record<string, unknown>] {
  if (digest.detector === 'hash-checksum' && typeof digest.digest === 'number') {
    return [key, { ...digest, digest: String(digest.digest) }];
  }
  return [key, digest];
}

export function deserializeChangeSignalState(json: string): RestoredEngineState | null {
  try {
    const parsed = JSON.parse(json) as SerializedEngineState;
    if (
      !parsed
      || !Number.isSafeInteger(parsed.cursor?.sequence)
      || !Array.isArray(parsed.baselineDigests)
      || !parsed.baselineDigests.every(isValidBaselineEntry)
    ) {
      return null;
    }
    return {
      initialCursor: parsed.cursor,
      baselineDigests: new Map(
        (parsed.baselineDigests as unknown as Array<[string, Record<string, unknown>]>).map(migrateBaselineEntry),
      ) as EngineState['baselineDigests'],
      ...(parsed.configBaseline !== undefined ? { configBaseline: parsed.configBaseline } : {}),
    };
  } catch {
    return null;
  }
}
