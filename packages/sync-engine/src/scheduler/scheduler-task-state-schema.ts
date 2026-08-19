import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';

type SchedulerTaskStateCommon = Omit<PersistedSchedulerTaskState, 'collection'> & {
	stateKey: string;
	collectionName: string;
};
export type SchedulerTaskStateDocument = SchedulerTaskStateCommon & { schemaVersion: 0 };

const maxSafeInteger = 9_007_199_254_740_991;
const fnv64Prime = 0x100000001b3n;

export function schedulerTaskStateKey(taskId: string): string {
	const first = fnv64(taskId, 0xcbf29ce484222325n);
	const second = fnv64(taskId, 0x84222325cbf29ce4n);
	return `scheduler-task:${first}-${second}`;
}

function fnv64(value: string, offset: bigint): string {
	let hash = offset;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= BigInt(value.charCodeAt(index));
		hash = BigInt.asUintN(64, hash * fnv64Prime);
	}
	return hash.toString(36).padStart(13, '0');
}

export const schedulerTaskStateSchema = {
	title: 'Woo/RxDB scheduler task state schema',
	version: 0,
	primaryKey: 'stateKey',
	type: 'object',
	properties: {
		stateKey: { type: 'string', maxLength: 64 },
		taskId: { type: 'string' },
		requirementId: { type: 'string', maxLength: 256 },
		collectionName: { type: 'string', maxLength: 64 },
		queryKey: { type: 'string', maxLength: 256 },
		documentIds: {
			type: 'array',
			items: { type: 'string' },
		},
		remoteIds: {
			type: 'array',
			items: { type: 'string', maxLength: 64 },
		},
		limit: { type: 'number', minimum: 0, maximum: maxSafeInteger, multipleOf: 1 },
		priority: { type: 'number', minimum: 0, maximum: maxSafeInteger, multipleOf: 1 },
		mode: { type: 'string', enum: ['greedy', 'windowed', 'on-demand'], maxLength: 16 },
		status: { type: 'string', enum: ['queued', 'in-flight', 'completed', 'failed'], maxLength: 16 },
		ownerId: { type: ['string', 'null'], maxLength: 128 },
		claimedUntilMs: timestampMsSchemaField(true),
		attempt: { type: 'number', minimum: 0, maximum: maxSafeInteger, multipleOf: 1 },
		retryAfterMs: timestampMsSchemaField(true),
		updatedAtMs: timestampMsSchemaField(),
		rerunRequested: { type: 'boolean' },
		schemaVersion: { type: 'number', enum: [0] },
	},
	required: [
		'stateKey',
		'taskId',
		'requirementId',
		'collectionName',
		'queryKey',
		'limit',
		'priority',
		'mode',
		'status',
		'ownerId',
		'claimedUntilMs',
		'attempt',
		'retryAfterMs',
		'updatedAtMs',
		'schemaVersion',
	],
	indexes: [['status'], ['collectionName', 'queryKey'], ['priority']],
} as const;
