import {
	markPersistedSchedulerDocument,
	type PersistedSchedulerSchemaVersionMarker,
} from '../collections/schema-version';
import { timestampMsSchemaField } from '../collections/timestamp-schema-field';

import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';

type SchedulerTaskStateCommon = Omit<PersistedSchedulerTaskState, 'collection'> & {
	stateKey: string;
	collectionName: string;
};
/** The current (v4) persisted shape — same fields as v3; v4 exists as the `wooIds` contract boundary (see migrateSchedulerTaskStateV4). */
export type SchedulerTaskStateDocument = SchedulerTaskStateCommon &
	PersistedSchedulerSchemaVersionMarker<4>;
/** v3: carries the optional `rerunRequested` coalescing flag (#318) — field-identical to v4. */
export type SchedulerTaskStateV3Document = SchedulerTaskStateCommon &
	PersistedSchedulerSchemaVersionMarker<3>;
/** v2: before the `rerunRequested` coalescing flag existed (carried the numeric `wooIds` channel). */
export type SchedulerTaskStateV2Document = Omit<SchedulerTaskStateCommon, 'rerunRequested'> &
	PersistedSchedulerSchemaVersionMarker<2>;
/** v1: before the `wooIds` numeric channel existed. */
export type SchedulerTaskStateV1Document = Omit<
	SchedulerTaskStateCommon,
	'wooIds' | 'rerunRequested'
> &
	PersistedSchedulerSchemaVersionMarker<1>;
/** v0: pre-marker shape (raw state, before stateKey/collectionName + wooIds). */
export type SchedulerTaskStateV0Document = Omit<
	PersistedSchedulerTaskState,
	'wooIds' | 'rerunRequested'
>;

export function migrateSchedulerTaskStateV1(
	document: SchedulerTaskStateV0Document
): SchedulerTaskStateV1Document {
	const { collection, ...rest } = document;
	return markPersistedSchedulerDocument(
		{ ...rest, stateKey: schedulerTaskStateKey(document.taskId), collectionName: collection },
		1
	);
}

/** v1 → v2: additive — `wooIds` is optional, so a v1 doc simply gains the (absent) field. */
export function migrateSchedulerTaskStateV2(
	document: SchedulerTaskStateV1Document
): SchedulerTaskStateV2Document {
	const { schemaVersion: _schemaVersion, ...rest } = document;
	return markPersistedSchedulerDocument(rest, 2);
}

/** v2 → v3: additive — `rerunRequested` is optional, so a v2 doc simply gains the (absent) field. */
export function migrateSchedulerTaskStateV3(
	document: SchedulerTaskStateV2Document
): SchedulerTaskStateV3Document {
	const { schemaVersion: _schemaVersion, ...rest } = document;
	return markPersistedSchedulerDocument(rest, 3);
}

/**
 * The collections whose TARGETED fetchers read the explicit `wooIds` channel and treat its
 * absence as a contract error (rxSchedulerOrderFetcher / rxSchedulerProductFetcher). Customers
 * are deliberately NOT here: the customer fetcher resolves targets from `ids` itself (including
 * the born-local `customer:default` sentinel), so a customer targeted row without `wooIds` is
 * perfectly runnable and must survive migration.
 */
const WOO_IDS_REQUIRED_COLLECTIONS = new Set(['orders', 'products']);

/**
 * v3 → v4: the `wooIds` contract boundary — v4 adds no fields; it exists so EVERY persisted doc
 * passes through this check, including rows already written AT v3 while the reverse-parse
 * fallback still existed (a v2→v3 check alone would skip them). An orders/products TARGETED doc
 * (`ids` present) without `wooIds` predates the explicit numeric-id channel and can never fetch —
 * those fetchers treat a missing `wooIds` as a contract error (the `woo-<thing>:<id>`
 * reverse-parse scaffolding is deleted), so migrating such a doc forward would fail-and-retry
 * forever. Returning null DROPS the document instead: stale queued targeted work is re-derivable
 * (the scheduler re-seeds targeted tasks from coverage requirements), so deletion is safe. There
 * is no runtime fallback — the legacy shape dies here, at the migration boundary. Non-targeted
 * (lane/query) docs carry no ids, and targeted docs for ids-resolving collections (customers)
 * are unaffected.
 */
export function migrateSchedulerTaskStateV4(
	document: SchedulerTaskStateV3Document
): SchedulerTaskStateDocument | null {
	if (
		WOO_IDS_REQUIRED_COLLECTIONS.has(document.collectionName) &&
		(document.ids?.length ?? 0) > 0 &&
		(document.wooIds?.length ?? 0) === 0
	) {
		return null;
	}
	const { schemaVersion: _schemaVersion, ...rest } = document;
	return markPersistedSchedulerDocument(rest, 4);
}

export const schedulerTaskStateMigrationStrategies = {
	1: migrateSchedulerTaskStateV1,
	2: migrateSchedulerTaskStateV2,
	3: migrateSchedulerTaskStateV3,
	4: migrateSchedulerTaskStateV4,
};

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
	version: 4,
	primaryKey: 'stateKey',
	type: 'object',
	properties: {
		stateKey: { type: 'string', maxLength: 64 },
		taskId: { type: 'string' },
		requirementId: { type: 'string', maxLength: 256 },
		collectionName: { type: 'string', maxLength: 64 },
		queryKey: { type: 'string', maxLength: 256 },
		ids: {
			type: 'array',
			items: { type: 'string' },
		},
		wooIds: {
			type: 'array',
			items: { type: 'number', minimum: 1, maximum: maxSafeInteger, multipleOf: 1 },
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
		schemaVersion: { type: 'number', enum: [4] },
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
