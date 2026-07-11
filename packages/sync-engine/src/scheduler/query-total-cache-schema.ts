import {
	markPersistedSchedulerDocument,
	type PersistedSchedulerSchemaVersionMarker,
} from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { QueryTotalCacheEntry } from './query-total-requests';

export type QueryTotalCacheDocument = QueryTotalCacheEntry &
	PersistedSchedulerSchemaVersionMarker<1>;
export type QueryTotalCacheV0Document = QueryTotalCacheEntry;

export function migrateQueryTotalCacheV1(
	document: QueryTotalCacheV0Document
): QueryTotalCacheDocument {
	return markPersistedSchedulerDocument(document, 1);
}

export const queryTotalCacheMigrationStrategies = {
	1: migrateQueryTotalCacheV1,
};

const maxSafeInteger = 9_007_199_254_740_991;

export const queryTotalCacheSchema = {
	title: 'Woo/RxDB query total cache schema',
	version: 1,
	primaryKey: 'queryKey',
	type: 'object',
	properties: {
		queryKey: { type: 'string', maxLength: 256 },
		totalMatchingRecords: { type: 'number', minimum: 0, maximum: maxSafeInteger, multipleOf: 1 },
		freshUntilMs: timestampMsSchemaField(),
		updatedAtMs: timestampMsSchemaField(),
		schemaVersion: { type: 'number', enum: [1] },
	},
	required: ['queryKey', 'totalMatchingRecords', 'freshUntilMs', 'updatedAtMs', 'schemaVersion'],
	indexes: [['freshUntilMs']],
} as const;
