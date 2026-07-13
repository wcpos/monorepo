import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';
import type { FetchTask, FetchTaskResult } from './replication-policy';
import type { SchedulerFetcher } from './replication-scheduler';
import type { CompleteOrRequeueOutcome } from './rx-scheduler-task-state-repository';

export type PersistedSchedulerTaskRunnerRepository = {
	readRunnable(nowMs: number): Promise<PersistedSchedulerTaskState[]>;
	claim(
		expectedState: PersistedSchedulerTaskState,
		claimedState: PersistedSchedulerTaskState
	): Promise<boolean>;
	completeOrRequeue(
		expectedState: PersistedSchedulerTaskState,
		completedState: PersistedSchedulerTaskState,
		requeuedState: PersistedSchedulerTaskState
	): Promise<CompleteOrRequeueOutcome>;
	markFailed(
		expectedState: PersistedSchedulerTaskState,
		failedState: PersistedSchedulerTaskState
	): Promise<boolean>;
};

export type PersistedSchedulerTaskRunnerInput = {
	repository: PersistedSchedulerTaskRunnerRepository;
	fetcher: SchedulerFetcher;
	signal?: AbortSignal;
	claimedStates?: PersistedSchedulerTaskState[];
	ownerId: string;
	nowMs: number;
	getNowMs?: () => number;
	leaseForMs: number;
	retryAfterMs: number;
	maxRequestsForTask?: (task: FetchTask, state: PersistedSchedulerTaskState) => number | undefined;
	maxRequestsPerTask?: number;
	/** Called after each completed fetch batch with cumulative drain totals. */
	onProgress?: (progress: { collection: string; documents: number; requests: number }) => void;
};

export type PersistedSchedulerTaskRunnerResult = {
	scanned: number;
	claimLost: number;
	completionLost: number;
	succeeded: number;
	/** Coalescing (#318): completions that re-queued a fresh run because a change arrived mid-flight. */
	coalescedReruns: number;
	failed: number;
	failureLost: number;
	renewalLost: number;
	totalDocuments: number;
	totalRequests: number;
};

function throwIfAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	if (signal.reason instanceof Error) throw signal.reason;
	throw new Error('Persisted scheduler runner aborted');
}

function taskFromState(state: PersistedSchedulerTaskState): FetchTask {
	return {
		id: state.taskId,
		requirementId: state.requirementId,
		collection: state.collection,
		queryKey: state.queryKey,
		ids: state.ids,
		wooIds: state.wooIds,
		limit: state.limit,
		priority: state.priority,
		mode: state.mode,
	};
}

function currentTime(input: PersistedSchedulerTaskRunnerInput): number {
	return input.getNowMs?.() ?? input.nowMs;
}

function claimState(
	state: PersistedSchedulerTaskState,
	input: PersistedSchedulerTaskRunnerInput,
	claimedAtMs: number,
	incrementAttempt = true
): PersistedSchedulerTaskState {
	return {
		...state,
		status: 'in-flight',
		ownerId: input.ownerId,
		claimedUntilMs: claimedAtMs + input.leaseForMs,
		attempt: incrementAttempt ? state.attempt + 1 : state.attempt,
		retryAfterMs: null,
		updatedAtMs: claimedAtMs,
	};
}

function completedState(
	state: PersistedSchedulerTaskState,
	completedAtMs: number
): PersistedSchedulerTaskState {
	return {
		...state,
		status: 'completed',
		ownerId: null,
		claimedUntilMs: null,
		retryAfterMs: null,
		updatedAtMs: completedAtMs,
	};
}

/**
 * The fresh queued state a coalesced re-run lands in (#318). A re-run is a NEW pull, not
 * a retry, so `attempt` resets to 0 and the flag is cleared. `completeOrRequeue` applies
 * this only when the completing task had `rerunRequested` set.
 */
function requeuedState(
	state: PersistedSchedulerTaskState,
	requeuedAtMs: number
): PersistedSchedulerTaskState {
	return {
		...state,
		status: 'queued',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 0,
		retryAfterMs: null,
		updatedAtMs: requeuedAtMs,
		rerunRequested: false,
	};
}

function failedState(
	state: PersistedSchedulerTaskState,
	input: PersistedSchedulerTaskRunnerInput,
	failedAtMs: number
): PersistedSchedulerTaskState {
	return {
		...state,
		status: 'failed',
		ownerId: null,
		claimedUntilMs: null,
		retryAfterMs: failedAtMs + input.retryAfterMs,
		updatedAtMs: failedAtMs,
	};
}

function recordFetchResult(
	result: PersistedSchedulerTaskRunnerResult,
	fetchResult: FetchTaskResult
): void {
	result.totalDocuments += fetchResult.documentCount;
	result.totalRequests += fetchResult.requestCount;
}

function maxRequestsForTask(
	input: PersistedSchedulerTaskRunnerInput,
	task: FetchTask,
	state: PersistedSchedulerTaskState
): number {
	return input.maxRequestsForTask?.(task, state) ?? input.maxRequestsPerTask ?? 100;
}

function hasActiveCurrentOwner(
	state: PersistedSchedulerTaskState,
	input: PersistedSchedulerTaskRunnerInput,
	nowMs: number
): boolean {
	return (
		state.status === 'in-flight' &&
		state.ownerId === input.ownerId &&
		state.claimedUntilMs !== null &&
		state.claimedUntilMs > nowMs
	);
}

function renewState(
	state: PersistedSchedulerTaskState,
	input: PersistedSchedulerTaskRunnerInput,
	renewedAtMs: number
): PersistedSchedulerTaskState {
	return {
		...state,
		claimedUntilMs: renewedAtMs + input.leaseForMs,
		updatedAtMs: renewedAtMs,
	};
}

export async function runPersistedSchedulerTasks(
	input: PersistedSchedulerTaskRunnerInput
): Promise<PersistedSchedulerTaskRunnerResult> {
	const scanStartedAtMs = currentTime(input);
	const runnableStates = await input.repository.readRunnable(scanStartedAtMs);
	const taskStates = [...runnableStates, ...(input.claimedStates ?? [])];
	// Priority drives DRAIN order (the C3 gap). readRunnable returns rows in
	// repository order, so without this a low-priority backlog lane can drain
	// ahead of the greedy tax-rate lane the POS needs before it can sell. Sort
	// highest-priority-first (tie-break by taskId), matching planSchedulerTasks'
	// comparator. See docs/pos-replication-model.md "The C3 gap".
	taskStates.sort(
		(left, right) => right.priority - left.priority || left.taskId.localeCompare(right.taskId)
	);
	const result: PersistedSchedulerTaskRunnerResult = {
		scanned: taskStates.length,
		claimLost: 0,
		completionLost: 0,
		succeeded: 0,
		coalescedReruns: 0,
		failed: 0,
		failureLost: 0,
		renewalLost: 0,
		totalDocuments: 0,
		totalRequests: 0,
	};

	for (const runnableState of taskStates) {
		throwIfAborted(input.signal);
		let activeState = runnableState;
		const ownershipCheckedAtMs = currentTime(input);
		const claimedState = hasActiveCurrentOwner(runnableState, input, ownershipCheckedAtMs)
			? renewState(runnableState, input, ownershipCheckedAtMs)
			: claimState(runnableState, input, ownershipCheckedAtMs);
		const claimed = await input.repository.claim(runnableState, claimedState);
		if (!claimed) {
			result.claimLost += 1;
			continue;
		}
		activeState = claimedState;

		const task = taskFromState(runnableState);
		const maxRequests = maxRequestsForTask(input, task, runnableState);
		let taskCompleted = false;
		let requests = 0;

		try {
			while (!taskCompleted) {
				throwIfAborted(input.signal);
				requests += 1;
				const fetchResult = input.signal
					? await input.fetcher(task, { signal: input.signal })
					: await input.fetcher(task);
				recordFetchResult(result, fetchResult);
				try {
					input.onProgress?.({
						collection: task.collection,
						documents: result.totalDocuments,
						requests: result.totalRequests,
					});
				} catch {
					// Progress observers are optional telemetry and must not poison durable task state.
				}
				taskCompleted = task.mode !== 'greedy' || fetchResult.completed;

				if (!taskCompleted && requests >= maxRequests) {
					throw new Error(`Greedy task ${task.id} exceeded maxRequests=${maxRequests}`);
				}

				if (!taskCompleted) {
					throwIfAborted(input.signal);
					const renewedAtMs = currentTime(input);
					const renewedState = renewState(activeState, input, renewedAtMs);
					const renewed = await input.repository.claim(activeState, renewedState);
					if (!renewed) {
						result.renewalLost += 1;
						break;
					}
					activeState = renewedState;
				}
			}
		} catch (error) {
			if (input.signal?.aborted) throw error;

			const failedAtMs = currentTime(input);
			const failed = await input.repository.markFailed(
				activeState,
				failedState(activeState, input, failedAtMs)
			);
			if (!failed) {
				result.failureLost += 1;
				continue;
			}
			result.failed += 1;
			continue;
		}

		if (!taskCompleted) continue;

		const completedAtMs = currentTime(input);
		const completionOutcome = await input.repository.completeOrRequeue(
			activeState,
			completedState(activeState, completedAtMs),
			requeuedState(activeState, completedAtMs)
		);
		if (completionOutcome === 'claim-lost') {
			result.completionLost += 1;
			continue;
		}
		// Both 'completed' and 'requeued' successfully handled the task; a requeue means a
		// change arrived mid-flight, so a fresh run was queued to catch it (#318).
		result.succeeded += 1;
		if (completionOutcome === 'requeued') result.coalescedReruns += 1;
	}

	return result;
}
