import type { LocalCoverageState } from './coverage-model';

export type PersistedCoverageRecord = {
  collection: string;
  id: string;
  coveredQueryKeys: string[];
  freshUntilMs: number;
  updatedAtMs: number;
};

export type PersistedCoverageLane = {
  collection: string;
  queryKey: string;
  complete: boolean;
  expectedRecordIds: string[];
  freshUntilMs: number;
  updatedAtMs: number;
};

export type PersistedCoverageDocumentSet = {
  records: PersistedCoverageRecord[];
  lanes: PersistedCoverageLane[];
};

export type ToLocalCoverageStateInput = {
  documents: PersistedCoverageDocumentSet;
  nowMs: number;
};

export type ExpectedRecordIdsForLaneInput = ToLocalCoverageStateInput & {
  collection: string;
  queryKey: string;
};

export type PersistedCoverageRetentionAction = 'keep' | 'refresh' | 'remove';
export type PersistedCoverageDocumentType = 'record' | 'lane';

export type PersistedCoverageRetentionDecision = {
  documentType: PersistedCoverageDocumentType;
  collection: string;
  key: string;
  action: PersistedCoverageRetentionAction;
  reason: string;
};

export type PlanPersistedCoverageRetentionInput = ToLocalCoverageStateInput & {
  retainStaleForMs: number;
};

export type PersistedCoverageCompactionResult = {
  documents: PersistedCoverageDocumentSet;
  decisions: PersistedCoverageRetentionDecision[];
  removed: PersistedCoverageRetentionDecision[];
};

export const coverageSchemaIndexes = {
  records: [
    ['collection', 'id'],
    ['collection', 'freshUntilMs'],
  ],
  lanes: [
    ['collection', 'queryKey'],
    ['collection', 'freshUntilMs'],
  ],
} as const;

function isFresh(freshUntilMs: number, nowMs: number): boolean {
  return freshUntilMs > nowMs;
}

function retentionDecision(input: {
  documentType: PersistedCoverageDocumentType;
  collection: string;
  key: string;
  freshUntilMs: number;
  nowMs: number;
  retainStaleForMs: number;
}): PersistedCoverageRetentionDecision {
  if (isFresh(input.freshUntilMs, input.nowMs)) {
    return {
      documentType: input.documentType,
      collection: input.collection,
      key: input.key,
      action: 'keep',
      reason: 'coverage is still fresh',
    };
  }

  if (input.nowMs - input.freshUntilMs <= input.retainStaleForMs) {
    return {
      documentType: input.documentType,
      collection: input.collection,
      key: input.key,
      action: 'refresh',
      reason: 'coverage is stale but still inside retention window',
    };
  }

  return {
    documentType: input.documentType,
    collection: input.collection,
    key: input.key,
    action: 'remove',
    reason: 'coverage is stale beyond retention window',
  };
}

export function toLocalCoverageState(input: ToLocalCoverageStateInput): LocalCoverageState {
  return {
    records: input.documents.records.map((record) => ({
      collection: record.collection,
      id: record.id,
      fresh: isFresh(record.freshUntilMs, input.nowMs),
    })),
    lanes: input.documents.lanes.map((lane) => ({
      collection: lane.collection,
      queryKey: lane.queryKey,
      complete: lane.complete,
      fresh: isFresh(lane.freshUntilMs, input.nowMs),
    })),
  };
}

export function expectedRecordIdsForLane(input: ExpectedRecordIdsForLaneInput): string[] {
  const lane = input.documents.lanes.find((candidate) => (
    candidate.collection === input.collection
    && candidate.queryKey === input.queryKey
    && candidate.complete
    && isFresh(candidate.freshUntilMs, input.nowMs)
  ));

  return lane ? [...lane.expectedRecordIds] : [];
}

export function planPersistedCoverageRetention(input: PlanPersistedCoverageRetentionInput): PersistedCoverageRetentionDecision[] {
  return [
    ...input.documents.records.map((record) => retentionDecision({
      documentType: 'record' as const,
      collection: record.collection,
      key: record.id,
      freshUntilMs: record.freshUntilMs,
      nowMs: input.nowMs,
      retainStaleForMs: input.retainStaleForMs,
    })),
    ...input.documents.lanes.map((lane) => retentionDecision({
      documentType: 'lane' as const,
      collection: lane.collection,
      key: lane.queryKey,
      freshUntilMs: lane.freshUntilMs,
      nowMs: input.nowMs,
      retainStaleForMs: input.retainStaleForMs,
    })),
  ];
}

export function compactPersistedCoverageDocuments(input: PlanPersistedCoverageRetentionInput): PersistedCoverageCompactionResult {
  const decisions = planPersistedCoverageRetention(input);
  const removedRecordKeys = new Set(decisions
    .filter((decision) => decision.documentType === 'record' && decision.action === 'remove')
    .map((decision) => `${decision.collection}::${decision.key}`));
  const removedLaneKeys = new Set(decisions
    .filter((decision) => decision.documentType === 'lane' && decision.action === 'remove')
    .map((decision) => `${decision.collection}::${decision.key}`));

  return {
    documents: {
      records: input.documents.records.filter((record) => !removedRecordKeys.has(`${record.collection}::${record.id}`)),
      lanes: input.documents.lanes.filter((lane) => !removedLaneKeys.has(`${lane.collection}::${lane.queryKey}`)),
    },
    decisions,
    removed: decisions.filter((decision) => decision.action === 'remove'),
  };
}
