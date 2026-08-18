/**
 * Generic TARGETED-RECORD scheduler-lane seeder — the shared template behind the
 * per-collection on-demand id seeders (`seedTargetedProductSchedulerTask`,
 * `seedTargetedOrderSchedulerTask`, and the planned `variations` lane that
 * rxChangeSignalReplicationTick.ts defers today).
 *
 * Every targeted lane does the same thing and differs only in five
 * collection-specific values, captured by `TargetedLaneDescriptor`:
 *
 *   normalize ids (dedup + ascending sort, positive-integer guard)
 *     → chunk at the scheduler key-length AND batch-size limits
 *     → build one FetchTask per chunk (`<keyPrefix>:ids:<ids>` queryKey,
 *       `<requirementPrefix>.targeted.<ids>` requirementId, `documentId(id)` doc ids)
 *     → seedPersistedSchedulerTasks (completed-dedupe semantics preserved verbatim —
 *       a NON-POSITIVE completedDedupeForMs disables completed-dedupe; see
 *       rxSchedulerTaskSeeder.ts).
 *
 * Adding a collection lane is a descriptor, not a copy.
 */

import { compareRemoteIds, type RemoteId, wooIdOf } from '@wcpos/sync-core';

import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import {
	RxSchedulerTaskStateRepository,
	type SchedulerTaskStateDatabase,
} from './rx-scheduler-task-state-repository';
import { withSchedulerSeedLedgerRecovery } from '../local-coverage/ledger-storage-recovery';
import { schedulerTaskStateSchema } from './scheduler-task-state-schema';

const SCHEDULER_TASK_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;

/** The per-collection values that distinguish one targeted-record lane from another. */
export type TargetedLaneDescriptor = {
	/** Collection the seeded FetchTasks belong to (e.g. `'products'`, `'orders'`). */
	collection: string;
	/** Singular noun used in id/batch validation messages (e.g. `'product'`, `'order'`). */
	idLabel: string;
	/** queryKey / taskId prefix → `<keyPrefix>:ids:<ids>` (e.g. `'products'`). */
	keyPrefix: string;
	/** requirementId prefix → `<requirementPrefix>.targeted.<ids>` (e.g. `'products'`). */
	requirementPrefix: string;
	/** Builds a Woo document id from a numeric record id (e.g. `id => `woo-product:${id}``). */
	documentId: (remoteId: RemoteId) => string;
	/** Default scheduler priority when the caller does not override it. */
	defaultPriority: number;
	/** Default per-task batch size when the caller does not override it. */
	defaultBatchSize: number;
	/** Default completed-dedupe window (ms); a non-positive value disables completed-dedupe. */
	defaultCompletedDedupeForMs: number;
};

export type SeedTargetedLaneInput = {
	remoteIds: RemoteId[];
	priority?: number;
	batchSize?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	database: SchedulerTaskStateDatabase;
	/** Opt into in-flight coalescing (#318) — set by change-signal targeted seeders. */
	coalesceInFlight?: boolean;
};

function normalizedLaneIds(descriptor: TargetedLaneDescriptor, remoteIds: RemoteId[]): RemoteId[] {
	const normalized = [
		...new Set(
			remoteIds.map((remoteId) => {
				const wooId = wooIdOf(remoteId);
				if (wooId <= 0) {
					throw new Error(
						`Targeted ${descriptor.idLabel} scheduler task requires positive integer ${descriptor.idLabel} ids: ${remoteId}`
					);
				}
				return remoteId;
			})
		),
	].sort(compareRemoteIds);
	if (normalized.length === 0) {
		throw new Error(
			`Targeted ${descriptor.idLabel} scheduler task requires at least one ${descriptor.idLabel} id`
		);
	}
	return normalized;
}

function laneKeyParts(
	descriptor: TargetedLaneDescriptor,
	ids: RemoteId[]
): { idsPart: string; requirementId: string; queryKey: string } {
	const idsPart = ids.join(',');
	return {
		idsPart,
		requirementId: `${descriptor.requirementPrefix}.targeted.${idsPart}`,
		queryKey: `${descriptor.keyPrefix}:ids:${idsPart}`,
	};
}

function chunkLaneIds(
	descriptor: TargetedLaneDescriptor,
	ids: RemoteId[],
	batchSize: number
): RemoteId[][] {
	const chunks: RemoteId[][] = [];
	let current: RemoteId[] = [];

	for (const id of ids) {
		const candidate = [...current, id];
		const { requirementId, queryKey } = laneKeyParts(descriptor, candidate);
		if (
			current.length > 0 &&
			(candidate.length > batchSize ||
				requirementId.length > SCHEDULER_TASK_KEY_MAX_LENGTH ||
				queryKey.length > SCHEDULER_TASK_KEY_MAX_LENGTH)
		) {
			chunks.push(current);
			current = [id];
		} else {
			current = candidate;
		}
	}

	if (current.length > 0) chunks.push(current);
	return chunks;
}

function laneBatchSize(descriptor: TargetedLaneDescriptor, batchSize?: number): number {
	const normalized = batchSize ?? descriptor.defaultBatchSize;
	if (!Number.isSafeInteger(normalized) || normalized <= 0) {
		throw new Error(
			`Targeted ${descriptor.idLabel} scheduler task batch size must be a positive integer`
		);
	}
	return normalized;
}

export async function seedTargetedLane(
	descriptor: TargetedLaneDescriptor,
	input: SeedTargetedLaneInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const ids = normalizedLaneIds(descriptor, input.remoteIds);
	const batchSize = laneBatchSize(descriptor, input.batchSize);
	const nowMs = input.nowMs ?? Date.now();

	// A `schedulerTaskStates` reconciliation refusal rebuilds the derivable ledger
	// and the seed runs again against the fresh store (#956) — callers treat a
	// resolved seed as a durable enqueue, so it must not resolve empty.
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(input.database),
				tasks: chunkLaneIds(descriptor, ids, batchSize).map((chunk) => {
					const { idsPart, requirementId, queryKey } = laneKeyParts(descriptor, chunk);
					return {
						id: `${descriptor.keyPrefix}:ids:${idsPart}:on-demand`,
						requirementId,
						collection: descriptor.collection,
						queryKey,
						ids: chunk.map((id) => descriptor.documentId(id)),
						// The validated numeric ids ride alongside the document keys so the fetcher
						// reads them directly — decoupled from the key encoding (uuid-ready).
						remoteIds: chunk,
						limit: batchSize,
						priority: input.priority ?? descriptor.defaultPriority,
						mode: 'on-demand',
					};
				}),
				nowMs,
				completedDedupeForMs: input.completedDedupeForMs ?? descriptor.defaultCompletedDedupeForMs,
				coalesceInFlight: input.coalesceInFlight ?? false,
			}),
	});
}
