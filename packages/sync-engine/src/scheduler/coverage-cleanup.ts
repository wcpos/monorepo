import type { LocalRecordCoverage } from './coverage-model';

export type CoverageCleanupRecord = LocalRecordCoverage & {
  coveredQueryKeys: string[];
};

export type CoverageCleanupAction = 'keep' | 'refresh' | 'remove';

export type CoverageCleanupInput = {
  collection: string;
  queryKey: string;
  expectedRecordIds: string[];
  records: CoverageCleanupRecord[];
};

export type CoverageCleanupDecision = {
  recordId: string;
  action: CoverageCleanupAction;
  reason: string;
};

export function planCoverageCleanup(input: CoverageCleanupInput): CoverageCleanupDecision[] {
  const expectedIds = new Set(input.expectedRecordIds);

  return input.records
    .filter((record) => record.collection === input.collection && record.coveredQueryKeys.includes(input.queryKey))
    .map((record) => {
      if (!expectedIds.has(record.id)) {
        return {
          recordId: record.id,
          action: 'remove' as const,
          reason: 'record is no longer covered by lane',
        };
      }

      if (!record.fresh) {
        return {
          recordId: record.id,
          action: 'refresh' as const,
          reason: 'record is expected by lane but stale',
        };
      }

      return {
        recordId: record.id,
        action: 'keep' as const,
        reason: 'record is expected by lane and fresh',
      };
    });
}
