import { type PersistedSchedulerSchemaVersionMarker } from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { PersistedCoverageLane, PersistedCoverageRecord } from '../scheduler';

export type CoverageRecordDocument = Omit<PersistedCoverageRecord, 'collection'> &
	PersistedSchedulerSchemaVersionMarker<2> & {
		coverageKey: string;
		collectionName: string;
	};

/** The current lane shape — carries the optional ranged-walk resume cursor (#954). */
export type CoverageLaneDocument = Omit<PersistedCoverageLane, 'collection'> &
	PersistedSchedulerSchemaVersionMarker<3> & {
		laneKey: string;
		collectionName: string;
	};

const maxSafeInteger = 9_007_199_254_740_991;

export const coverageRecordSchema = {
	title: 'Woo/RxDB coverage record schema',
	version: 0,
	primaryKey: 'coverageKey',
	type: 'object',
	properties: {
		coverageKey: { type: 'string', maxLength: 256 },
		collectionName: { type: 'string', maxLength: 64 },
		documentId: { type: 'string', maxLength: 128 },
		coveredQueryKeys: { type: 'array', items: { type: 'string' } },
		freshUntilMs: timestampMsSchemaField(),
		updatedAtMs: timestampMsSchemaField(),
		schemaVersion: { type: 'number', enum: [2] },
	},
	required: [
		'coverageKey',
		'collectionName',
		'documentId',
		'coveredQueryKeys',
		'freshUntilMs',
		'updatedAtMs',
		'schemaVersion',
	],
	indexes: [
		['collectionName', 'documentId'],
		['collectionName', 'freshUntilMs'],
	],
} as const;

export const coverageLaneSchema = {
	title: 'Woo/RxDB coverage lane schema',
	version: 0,
	primaryKey: 'laneKey',
	type: 'object',
	properties: {
		laneKey: { type: 'string', maxLength: 322 },
		collectionName: { type: 'string', maxLength: 64 },
		queryKey: { type: 'string', maxLength: 256 },
		complete: { type: 'boolean' },
		expectedRecordIds: { type: 'array', items: { type: 'string' } },
		freshUntilMs: timestampMsSchemaField(),
		updatedAtMs: timestampMsSchemaField(),
		// Optional: only a ranged fetch-to-completion lane that stopped mid-range carries it (#954).
		rangedResume: {
			type: 'object',
			properties: {
				beforeSeconds: { type: 'number', minimum: 0, maximum: maxSafeInteger, multipleOf: 1 },
				excludeWooIds: {
					type: 'array',
					items: { type: 'number', minimum: 1, maximum: maxSafeInteger, multipleOf: 1 },
				},
				totalRecords: {
					type: ['number', 'null'],
					minimum: 0,
					maximum: maxSafeInteger,
					multipleOf: 1,
				},
				downloadedRecords: {
					type: 'number',
					minimum: 0,
					maximum: maxSafeInteger,
					multipleOf: 1,
				},
			},
			required: ['beforeSeconds', 'excludeWooIds', 'totalRecords'],
		},
		schemaVersion: { type: 'number', enum: [3] },
	},
	required: [
		'laneKey',
		'collectionName',
		'queryKey',
		'complete',
		'expectedRecordIds',
		'freshUntilMs',
		'updatedAtMs',
		'schemaVersion',
	],
	indexes: [
		['collectionName', 'queryKey'],
		['collectionName', 'freshUntilMs'],
	],
} as const;
