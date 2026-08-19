import { type PersistedSchedulerSchemaVersionMarker } from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { CoverageCompactionFailure } from '../scheduler';

export type CoverageCompactionFailureDocument = PersistedSchedulerSchemaVersionMarker<1> & {
	stateKey: 'coverage-compaction';
	failedAtMs: CoverageCompactionFailure['failedAtMs'] | null;
	retryAfterMs: CoverageCompactionFailure['retryAfterMs'] | null;
};
export const COVERAGE_COMPACTION_FAILURE_KEY = 'coverage-compaction' as const;

export const coverageCompactionFailureSchema = {
	title: 'Woo/RxDB coverage compaction failure schema',
	version: 0,
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
