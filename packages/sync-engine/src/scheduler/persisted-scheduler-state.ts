import type { RemoteId } from '@wcpos/sync-core';

import type { ReplicationMode } from './replication-policy';

export type PersistedSchedulerTaskStatus = 'queued' | 'in-flight' | 'completed' | 'failed';

export type PersistedSchedulerTaskState = {
	taskId: string;
	requirementId: string;
	collection: string;
	queryKey: string;
	/** Engine document keys the task is targeting (`descriptor.documentId(...)` values). */
	documentIds?: string[];
	/** Numeric Woo server ids for a targeted task — persisted so the fetch survives a
	 * rehydrate once document keys are uuids (the regex can't recover them). */
	remoteIds?: RemoteId[];
	limit: number;
	priority: number;
	mode: ReplicationMode;
	status: PersistedSchedulerTaskStatus;
	ownerId: string | null;
	claimedUntilMs: number | null;
	attempt: number;
	retryAfterMs: number | null;
	updatedAtMs: number;
	/**
	 * Change-signal coalescing (#318). Set when a fresh change is seeded while THIS task
	 * is still in-flight (the running fetch may have read past the change). The runner
	 * re-queues once on completion instead of finishing, then clears it — so a change that
	 * races an in-flight greedy refresh is never silently dropped. Absent/false by default.
	 * DELIBERATELY excluded from the `sameSchedulerTaskState` CAS compare so the seeder can
	 * set it on a claimed task without invalidating the owner's in-flight completion.
	 */
	rerunRequested?: boolean;
};
