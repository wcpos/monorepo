import {
	markPersistedSchedulerDocument,
	type PersistedSchedulerSchemaVersionMarker,
} from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { PersistedCoverageLane, PersistedCoverageRecord } from '../scheduler';

export type CoverageRecordDocument = Omit<PersistedCoverageRecord, 'collection'> &
	PersistedSchedulerSchemaVersionMarker<2> & {
		coverageKey: string;
		collectionName: string;
	};
export type CoverageRecordV0Document = PersistedCoverageRecord & { coverageKey: string };
export type CoverageRecordV1Document = CoverageRecordV0Document &
	PersistedSchedulerSchemaVersionMarker<1>;

export function migrateCoverageRecordV1(
	document: CoverageRecordV0Document
): CoverageRecordV1Document {
	return markPersistedSchedulerDocument(document, 1);
}

export function migrateCoverageRecordV2(
	document: CoverageRecordV1Document | CoverageRecordDocument
): CoverageRecordDocument {
	if ('collectionName' in document) {
		const { schemaVersion: _schemaVersion, ...rest } = document;
		return markPersistedSchedulerDocument(rest, 2);
	}
	const { collection, schemaVersion: _schemaVersion, ...rest } = document;
	return markPersistedSchedulerDocument({ ...rest, collectionName: collection }, 2);
}

/** The current (v3) lane shape — v2 plus the optional ranged-walk resume cursor (#954). */
export type CoverageLaneDocument = Omit<PersistedCoverageLane, 'collection'> &
	PersistedSchedulerSchemaVersionMarker<3> & {
		laneKey: string;
		collectionName: string;
	};
export type CoverageLaneV0Document = Omit<PersistedCoverageLane, 'rangedResume'> & {
	laneKey: string;
};
export type CoverageLaneV1Document = CoverageLaneV0Document &
	PersistedSchedulerSchemaVersionMarker<1>;
/** v2: `collection` renamed to `collectionName`; before the resume cursor existed. */
export type CoverageLaneV2Document = Omit<PersistedCoverageLane, 'collection' | 'rangedResume'> &
	PersistedSchedulerSchemaVersionMarker<2> & {
		laneKey: string;
		collectionName: string;
	};

export function migrateCoverageLaneV1(document: CoverageLaneV0Document): CoverageLaneV1Document {
	return markPersistedSchedulerDocument(document, 1);
}

export function migrateCoverageLaneV2(
	document: CoverageLaneV1Document | CoverageLaneV2Document
): CoverageLaneV2Document {
	if ('collectionName' in document) {
		const { schemaVersion: _schemaVersion, ...rest } = document;
		return markPersistedSchedulerDocument(rest, 2);
	}
	const { collection, schemaVersion: _schemaVersion, ...rest } = document;
	return markPersistedSchedulerDocument({ ...rest, collectionName: collection }, 2);
}

/**
 * v2 → v3: purely additive — `rangedResume` is optional, so a v2 lane simply gains the
 * (absent) field. A pre-existing incomplete ranged lane therefore starts its next pass with
 * no cursor, i.e. from the top of the range, which is exactly the pre-#954 behaviour for one
 * pass and converges from there.
 */
export function migrateCoverageLaneV3(document: CoverageLaneV2Document): CoverageLaneDocument {
	const { schemaVersion: _schemaVersion, ...rest } = document;
	return markPersistedSchedulerDocument(rest, 3);
}

export const coverageRecordMigrationStrategies = {
	1: migrateCoverageRecordV1,
	2: migrateCoverageRecordV2,
};

export const coverageLaneMigrationStrategies = {
	1: migrateCoverageLaneV1,
	2: migrateCoverageLaneV2,
	3: migrateCoverageLaneV3,
};

const maxSafeInteger = 9_007_199_254_740_991;

export const coverageRecordSchema = {
	title: 'Woo/RxDB coverage record schema',
	version: 2,
	primaryKey: 'coverageKey',
	type: 'object',
	properties: {
		coverageKey: { type: 'string', maxLength: 256 },
		collectionName: { type: 'string', maxLength: 64 },
		id: { type: 'string', maxLength: 128 },
		coveredQueryKeys: { type: 'array', items: { type: 'string' } },
		freshUntilMs: timestampMsSchemaField(),
		updatedAtMs: timestampMsSchemaField(),
		schemaVersion: { type: 'number', enum: [2] },
	},
	required: [
		'coverageKey',
		'collectionName',
		'id',
		'coveredQueryKeys',
		'freshUntilMs',
		'updatedAtMs',
		'schemaVersion',
	],
	indexes: [
		['collectionName', 'id'],
		['collectionName', 'freshUntilMs'],
	],
} as const;

export const coverageLaneSchema = {
	title: 'Woo/RxDB coverage lane schema',
	version: 3,
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
