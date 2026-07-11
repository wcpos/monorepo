import type { CoverageCompactionFailure } from '../scheduler/coverage-compaction-cadence';
import { markPersistedSchedulerDocument, type PersistedSchedulerSchemaVersionMarker } from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

export type CoverageCompactionFailureDocument = PersistedSchedulerSchemaVersionMarker<1> & {
  stateKey: 'coverage-compaction';
  failedAtMs: CoverageCompactionFailure['failedAtMs'] | null;
  retryAfterMs: CoverageCompactionFailure['retryAfterMs'] | null;
};
export type CoverageCompactionFailureV0Document = Omit<CoverageCompactionFailureDocument, 'schemaVersion'>;

export function migrateCoverageCompactionFailureV1(document: CoverageCompactionFailureV0Document): CoverageCompactionFailureDocument {
  return markPersistedSchedulerDocument(document, 1);
}

export const coverageCompactionFailureMigrationStrategies = {
  1: migrateCoverageCompactionFailureV1,
};

export const COVERAGE_COMPACTION_FAILURE_KEY = 'coverage-compaction' as const;

export const coverageCompactionFailureSchema = {
  title: 'Woo/RxDB coverage compaction failure schema',
  version: 1,
  primaryKey: 'stateKey',
  type: 'object',
  properties: {
    stateKey: { type: 'string', enum: [COVERAGE_COMPACTION_FAILURE_KEY], maxLength: 32 },
    failedAtMs: timestampMsSchemaField(true),
    retryAfterMs: timestampMsSchemaField(true),
    schemaVersion: { type: 'number', enum: [1] },
  },
  required: ['stateKey', 'failedAtMs', 'retryAfterMs', 'schemaVersion'],
} as const;
