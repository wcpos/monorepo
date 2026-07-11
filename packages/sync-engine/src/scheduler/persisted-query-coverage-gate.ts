import { evaluateCoverageRequirement, type CoverageDecision, type LocalRecordCoverage } from './coverage-model';
import type { ReplicationPolicy } from './replication-policy';

export type PersistedQueryLaneCoverage = {
  collection: string;
  queryKey: string;
  complete: boolean;
  fresh: boolean;
  expectedRecordIds: string[];
};

export type PersistedQueryCoverageGateInput = {
  collection: string;
  queryKey: string;
  currentRecordIds: string[];
  totalMatchingRecords?: number | null;
  laneCoverage: PersistedQueryLaneCoverage | null;
  recordCoverages: LocalRecordCoverage[];
  policy?: ReplicationPolicy;
};

const defaultQueryPolicy: ReplicationPolicy = {
  mode: 'windowed',
  priority: 0,
  batchSize: 1,
  offline: { read: 'serve-local', write: 'queue' },
};

export function evaluatePersistedQueryCoverageGate(input: PersistedQueryCoverageGateInput): CoverageDecision {
  return evaluateCoverageRequirement({
    strategy: 'record-and-lane',
    state: {
      records: input.recordCoverages,
      lanes: input.laneCoverage ? [{
        collection: input.laneCoverage.collection,
        queryKey: input.laneCoverage.queryKey,
        complete: input.laneCoverage.complete,
        fresh: input.laneCoverage.fresh,
      }] : [],
    },
    requirement: {
      id: input.queryKey,
      collection: input.collection,
      kind: 'query',
      queryKey: input.queryKey,
      policy: input.policy ?? defaultQueryPolicy,
    },
    expectedRecordIds: input.laneCoverage?.expectedRecordIds,
    currentRecordIds: input.currentRecordIds,
    totalMatchingRecords: input.totalMatchingRecords,
  });
}
