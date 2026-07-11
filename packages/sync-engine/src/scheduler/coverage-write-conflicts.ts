import type { PersistedCoverageDocumentSet, PersistedCoverageLane, PersistedCoverageRecord } from './persisted-coverage-schema';

export type CoverageWriteConflictSummary = {
  recordConflicts: number;
  laneConflicts: number;
  preventedFreshnessDowngrades: number;
  preventedLaneDowngrades: number;
};

export type CoverageWriteConflictMergeResult = {
  documents: PersistedCoverageDocumentSet;
  summary: CoverageWriteConflictSummary;
};

function recordKey(record: PersistedCoverageRecord): string {
  return `${record.collection}::${record.id}`;
}

function laneKey(lane: PersistedCoverageLane): string {
  return `${lane.collection}::${lane.queryKey}`;
}

function mergeUniqueInOrder(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])];
}

function mergeRecord(existing: PersistedCoverageRecord, next: PersistedCoverageRecord, summary: CoverageWriteConflictSummary): PersistedCoverageRecord {
  summary.recordConflicts += 1;
  if (next.freshUntilMs < existing.freshUntilMs) {
    summary.preventedFreshnessDowngrades += 1;
  }

  return {
    collection: existing.collection,
    id: existing.id,
    coveredQueryKeys: mergeUniqueInOrder(existing.coveredQueryKeys, next.coveredQueryKeys),
    freshUntilMs: Math.max(existing.freshUntilMs, next.freshUntilMs),
    updatedAtMs: Math.max(existing.updatedAtMs, next.updatedAtMs),
  };
}

function sameExpectedRecordIds(left: PersistedCoverageLane, right: PersistedCoverageLane): boolean {
  return left.expectedRecordIds.join('\u0000') === right.expectedRecordIds.join('\u0000');
}

function laneSnapshotTieBreaker(left: PersistedCoverageLane, right: PersistedCoverageLane): PersistedCoverageLane {
  if (left.freshUntilMs !== right.freshUntilMs) {
    return left.freshUntilMs > right.freshUntilMs ? left : right;
  }

  return left.expectedRecordIds.join('\u0000') <= right.expectedRecordIds.join('\u0000') ? left : right;
}

function mergeLaneTimestampTie(existing: PersistedCoverageLane, next: PersistedCoverageLane): PersistedCoverageLane {
  if (existing.complete && !next.complete) return existing;
  if (next.complete && !existing.complete) return next;
  return laneSnapshotTieBreaker(existing, next);
}

function mergeLane(existing: PersistedCoverageLane, next: PersistedCoverageLane, summary: CoverageWriteConflictSummary): PersistedCoverageLane {
  summary.laneConflicts += 1;
  const metadataDiffers = existing.complete !== next.complete
    || existing.freshUntilMs !== next.freshUntilMs
    || !sameExpectedRecordIds(existing, next);

  if (existing.complete && !next.complete && next.updatedAtMs <= existing.updatedAtMs) {
    if (metadataDiffers) {
      summary.preventedLaneDowngrades += 1;
    }
    return existing;
  }

  if (next.updatedAtMs < existing.updatedAtMs) {
    if (metadataDiffers) {
      summary.preventedLaneDowngrades += 1;
    }
    return existing;
  }

  if (next.updatedAtMs > existing.updatedAtMs) {
    return next;
  }

  if (metadataDiffers && (existing.complete || next.complete)) {
    summary.preventedLaneDowngrades += 1;
  }
  return mergeLaneTimestampTie(existing, next);
}

export function mergePersistedCoverageWrites(documentSets: PersistedCoverageDocumentSet[]): CoverageWriteConflictMergeResult {
  const summary: CoverageWriteConflictSummary = {
    recordConflicts: 0,
    laneConflicts: 0,
    preventedFreshnessDowngrades: 0,
    preventedLaneDowngrades: 0,
  };
  const records = new Map<string, PersistedCoverageRecord>();
  const lanes = new Map<string, PersistedCoverageLane>();

  for (const documentSet of documentSets) {
    for (const record of documentSet.records) {
      const key = recordKey(record);
      const existing = records.get(key);
      records.set(key, existing ? mergeRecord(existing, record, summary) : record);
    }

    for (const lane of documentSet.lanes) {
      const key = laneKey(lane);
      const existing = lanes.get(key);
      lanes.set(key, existing ? mergeLane(existing, lane, summary) : lane);
    }
  }

  return {
    documents: {
      records: [...records.values()],
      lanes: [...lanes.values()],
    },
    summary,
  };
}
