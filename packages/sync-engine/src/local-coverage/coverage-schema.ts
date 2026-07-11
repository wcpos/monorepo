import {
	markPersistedSchedulerDocument,
	type PersistedSchedulerSchemaVersionMarker,
} from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type {
	PersistedCoverageLane,
	PersistedCoverageRecord,
} from '../scheduler/persisted-coverage-schema';

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

export type CoverageLaneDocument = Omit<PersistedCoverageLane, 'collection'> &
	PersistedSchedulerSchemaVersionMarker<2> & {
		laneKey: string;
		collectionName: string;
	};
export type CoverageLaneV0Document = PersistedCoverageLane & { laneKey: string };
export type CoverageLaneV1Document = CoverageLaneV0Document &
	PersistedSchedulerSchemaVersionMarker<1>;

export function migrateCoverageLaneV1(document: CoverageLaneV0Document): CoverageLaneV1Document {
	return markPersistedSchedulerDocument(document, 1);
}

export function migrateCoverageLaneV2(
	document: CoverageLaneV1Document | CoverageLaneDocument
): CoverageLaneDocument {
	if ('collectionName' in document) {
		const { schemaVersion: _schemaVersion, ...rest } = document;
		return markPersistedSchedulerDocument(rest, 2);
	}
	const { collection, schemaVersion: _schemaVersion, ...rest } = document;
	return markPersistedSchedulerDocument({ ...rest, collectionName: collection }, 2);
}

export const coverageRecordMigrationStrategies = {
	1: migrateCoverageRecordV1,
	2: migrateCoverageRecordV2,
};

export const coverageLaneMigrationStrategies = {
	1: migrateCoverageLaneV1,
	2: migrateCoverageLaneV2,
};

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
	version: 2,
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
		schemaVersion: { type: 'number', enum: [2] },
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
