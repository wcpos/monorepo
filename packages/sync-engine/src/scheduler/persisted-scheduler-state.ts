import type { FetchTask, ReplicationMode } from './replication-policy';

export type PersistedSchedulerTaskStatus = 'queued' | 'in-flight' | 'completed' | 'failed';

export type PersistedSchedulerTaskState = {
	taskId: string;
	requirementId: string;
	collection: string;
	queryKey: string;
	ids?: string[];
	/** Numeric Woo server ids for a targeted task — persisted so the fetch survives a
	 * rehydrate once document keys are uuids (the regex can't recover them). */
	wooIds?: number[];
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

export type PersistedSchedulerClaimReason = 'new-task' | 'queued' | 'expired-owner' | 'retry-ready';
export type PersistedSchedulerWaitReason = 'active-owner' | 'retry-backoff';

export type PersistedSchedulerTaskClaim = {
	taskId: string;
	reason: PersistedSchedulerClaimReason;
};

export type PersistedSchedulerTaskWait = {
	taskId: string;
	ownerId: string | null;
	reason: PersistedSchedulerWaitReason;
};

export type PersistedSchedulerTaskStatePlanInput = {
	nowMs: number;
	ownerId: string;
	claimForMs: number;
	completedDedupeForMs?: number;
	ignoreRetryBackoff?: boolean;
	tasks: FetchTask[];
	existingStates: PersistedSchedulerTaskState[];
};

export type PersistedSchedulerTaskStatePlan = {
	states: PersistedSchedulerTaskState[];
	claimed: PersistedSchedulerTaskClaim[];
	waiting: PersistedSchedulerTaskWait[];
	completed: string[];
};

export function planPersistedSchedulerTaskStates(
	input: PersistedSchedulerTaskStatePlanInput
): PersistedSchedulerTaskStatePlan {
	const existingByTaskId = new Map(
		input.existingStates.map((state) => [state.taskId, state] as const)
	);
	const statesByTaskId = new Map(existingByTaskId);
	const claimed: PersistedSchedulerTaskClaim[] = [];
	const waiting: PersistedSchedulerTaskWait[] = [];
	const completed: string[] = [];

	const orderedTasks = [...input.tasks].sort(
		(left, right) => right.priority - left.priority || left.id.localeCompare(right.id)
	);
	const plannedTasks = new Map<string, FetchTask>();
	for (const task of orderedTasks) {
		if (!plannedTasks.has(task.id)) {
			plannedTasks.set(task.id, task);
		}
	}

	for (const task of plannedTasks.values()) {
		const existing = existingByTaskId.get(task.id);
		const baseState = existing ?? toQueuedState(task, input.nowMs);

		if (
			baseState.status === 'completed' &&
			input.nowMs - baseState.updatedAtMs <= (input.completedDedupeForMs ?? 0)
		) {
			completed.push(baseState.taskId);
			statesByTaskId.set(baseState.taskId, baseState);
			continue;
		}

		if (baseState.status === 'in-flight' && (baseState.claimedUntilMs ?? 0) > input.nowMs) {
			waiting.push({
				taskId: baseState.taskId,
				ownerId: baseState.ownerId,
				reason: 'active-owner',
			});
			statesByTaskId.set(baseState.taskId, baseState);
			continue;
		}

		if (
			baseState.status === 'failed' &&
			!input.ignoreRetryBackoff &&
			baseState.retryAfterMs !== null &&
			baseState.retryAfterMs > input.nowMs
		) {
			waiting.push({ taskId: baseState.taskId, ownerId: null, reason: 'retry-backoff' });
			statesByTaskId.set(baseState.taskId, baseState);
			continue;
		}

		const reason = claimReason(baseState, Boolean(existing));
		claimed.push({ taskId: baseState.taskId, reason });
		statesByTaskId.set(baseState.taskId, claimState(baseState, task, input));
	}

	return {
		states: [...statesByTaskId.values()],
		claimed,
		waiting,
		completed,
	};
}

function toQueuedState(task: FetchTask, nowMs: number): PersistedSchedulerTaskState {
	return {
		taskId: task.id,
		requirementId: task.requirementId,
		collection: task.collection,
		queryKey: task.queryKey,
		ids: task.ids,
		wooIds: task.wooIds,
		limit: task.limit,
		priority: task.priority,
		mode: task.mode,
		status: 'queued',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 0,
		retryAfterMs: null,
		updatedAtMs: nowMs,
	};
}

function claimReason(
	state: PersistedSchedulerTaskState,
	existed: boolean
): PersistedSchedulerClaimReason {
	if (!existed) return 'new-task';
	if (state.status === 'failed') return 'retry-ready';
	if (state.status === 'in-flight') return 'expired-owner';
	return 'queued';
}

function claimState(
	state: PersistedSchedulerTaskState,
	task: FetchTask,
	input: PersistedSchedulerTaskStatePlanInput
): PersistedSchedulerTaskState {
	return {
		...state,
		requirementId: task.requirementId,
		collection: task.collection,
		queryKey: task.queryKey,
		ids: task.ids,
		wooIds: task.wooIds,
		limit: task.limit,
		priority: task.priority,
		mode: task.mode,
		status: 'in-flight',
		ownerId: input.ownerId,
		claimedUntilMs: input.nowMs + input.claimForMs,
		attempt: state.attempt + 1,
		retryAfterMs: null,
		updatedAtMs: input.nowMs,
	};
}
