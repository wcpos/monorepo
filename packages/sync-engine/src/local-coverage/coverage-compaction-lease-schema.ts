import { type PersistedSchedulerSchemaVersionMarker } from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { CoverageCompactionLease } from '../scheduler';

export type CoverageCompactionLeaseDocument = CoverageCompactionLease &
	PersistedSchedulerSchemaVersionMarker<1> & {
		leaseKey: 'coverage-compaction';
	};
export const COVERAGE_COMPACTION_LEASE_KEY = 'coverage-compaction' as const;

export const coverageCompactionLeaseSchema = {
	title: 'Woo/RxDB coverage compaction lease schema',
	version: 0,
	primaryKey: 'leaseKey',
	type: 'object',
	properties: {
		leaseKey: { type: 'string', enum: [COVERAGE_COMPACTION_LEASE_KEY], maxLength: 32 },
		ownerId: { type: 'string', maxLength: 128 },
		acquiredAtMs: timestampMsSchemaField(),
		expiresAtMs: timestampMsSchemaField(),
		schemaVersion: { type: 'number', enum: [1] },
	},
	required: ['leaseKey', 'ownerId', 'acquiredAtMs', 'expiresAtMs', 'schemaVersion'],
	indexes: [['expiresAtMs']],
} as const;
