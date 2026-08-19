import { type PersistedSchedulerSchemaVersionMarker } from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { QueryTotalRequestState } from './query-total-request-lifecycle';

export type QueryTotalRequestStateDocument = QueryTotalRequestState &
	PersistedSchedulerSchemaVersionMarker<3>;
const maxSafeInteger = 9_007_199_254_740_991;

export const queryTotalRequestStateSchema = {
	title: 'Woo/RxDB query total request state schema',
	version: 0,
	primaryKey: 'queryKey',
	type: 'object',
	properties: {
		queryKey: { type: 'string', maxLength: 256 },
		status: { type: 'string', enum: ['in-flight', 'failed', 'idle'], maxLength: 16 },
		ownerId: { type: ['string', 'null'], maxLength: 128 },
		claimedUntilMs: timestampMsSchemaField(true),
		attempt: { type: 'number', minimum: 0, maximum: maxSafeInteger, multipleOf: 1 },
		retryAfterMs: timestampMsSchemaField(true),
		updatedAtMs: timestampMsSchemaField(),
		schemaVersion: { type: 'number', enum: [3] },
		request: {
			anyOf: [
				{
					type: 'object',
					properties: {
						queryKey: { type: 'string', maxLength: 256 },
						method: { type: 'string', enum: ['GET'], maxLength: 8 },
						endpoint: { type: 'string', maxLength: 512 },
						params: {
							type: 'object',
							additionalProperties: {
								anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
							},
						},
						totalHeader: { type: 'string', enum: ['X-WP-Total'], maxLength: 32 },
					},
					required: ['queryKey', 'method', 'endpoint', 'params', 'totalHeader'],
					additionalProperties: false,
				},
				{ type: 'null' },
			],
		},
	},
	required: [
		'queryKey',
		'status',
		'ownerId',
		'claimedUntilMs',
		'attempt',
		'retryAfterMs',
		'updatedAtMs',
		'request',
		'schemaVersion',
	],
	indexes: [['status']],
} as const;
