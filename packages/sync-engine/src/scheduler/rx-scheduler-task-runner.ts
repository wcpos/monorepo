import { isLedgerReconciliationRefusalError } from '../local-coverage/ledger-storage-recovery';

import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';
import type { FetchTask, FetchTaskResult, SchedulerFetcher } from './replication-policy';
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
	withTaskActivity?: <T>(task: FetchTask, work: () => Promise<T>) => Promise<T>;
};

/**
 * How ONE task ended its drain iteration.
 *
 * `succeeded` means the task ran to its own completion contract and its durable row was
 * completed/requeued. It does NOT mean the task's coverage lane is complete: a browse window
 * truncated by the per-drain page budget (#1030) still returns `completed: true` to the runner
 * while writing an honestly incomplete lane. Lane completeness lives on the lane; read it
 * there, not here.
 *
 * Everything else is a way the task did NOT finish under this owner. Only `failed` is an
 * actual error — the three `*-lost` kinds mean another owner took the row mid-flight, which is
 * a release for the declarer, not a failure.
 */
export type PersistedSchedulerTaskOutcomeKind =
	| 'succeeded'
	| 'failed'
	/** The claim CAS was lost before the fetch — another owner holds the row. */
	| 'claim-lost'
	/** The fetch ran, but the completion CAS was lost to another owner. */
	| 'completion-lost'
	/** The fetch threw AND the failure write was lost to another owner. */
	| 'failure-lost'
	/** A walk lost its lease renewal mid-flight (between pages or during one) and stopped short. */
	| 'renewal-lost';

/** One task's own verdict and its own document/request counts. */
export type PersistedSchedulerTaskOutcome = {
	taskId: string;
	requirementId: string;
	collection: string;
	queryKey: string;
	kind: PersistedSchedulerTaskOutcomeKind;
	documents: number;
	requests: number;
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
	/**
	 * The tick was ABORTED by a derivable-ledger rebuild (#956), not drained: the
	 * scheduler store was dropped mid-tick, so nothing was claimed or fetched. A
	 * demand-driven caller must release rather than report the requirement fetched.
	 */
	ledgerRebuilt: boolean;
	/**
	 * Per-task verdicts, one per SCANNED task, in drain order.
	 *
	 * A drain tick runs every runnable task, so the scalar counters above describe the TICK,
	 * not any one declarer's work. A caller that waited on a specific task (every require-plane
	 * browse/refresh branch) must read its verdict from here — reading `failed > 0` made an
	 * unrelated task's failure reject a browse that had actually succeeded.
	 *
	 * A task the tick never scanned has no entry: it was not runnable, which for a
	 * just-seeded task means another owner already holds it.
	 */
	tasks: PersistedSchedulerTaskOutcome[];
};

/** A drain tick that did nothing. */
export function emptyPersistedSchedulerTaskRunnerResult(): PersistedSchedulerTaskRunnerResult {
	return {
		scanned: 0,
		claimLost: 0,
		completionLost: 0,
		succeeded: 0,
		coalescedReruns: 0,
		failed: 0,
		failureLost: 0,
		renewalLost: 0,
		totalDocuments: 0,
		totalRequests: 0,
		ledgerRebuilt: false,
		tasks: [],
	};
}

/** The neutral result a drain tick returns when a ledger rebuild aborted it (#956). */
export function ledgerRebuiltSchedulerTaskRunnerResult(): PersistedSchedulerTaskRunnerResult {
	return { ...emptyPersistedSchedulerTaskRunnerResult(), ledgerRebuilt: true };
}

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
		remoteIds: state.remoteIds,
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

function releasedClaimState(
	state: PersistedSchedulerTaskState,
	releasedAtMs: number
): PersistedSchedulerTaskState {
	return {
		...state,
		status: 'queued',
		ownerId: null,
		claimedUntilMs: null,
		retryAfterMs: null,
		updatedAtMs: releasedAtMs,
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
	fetchResult: FetchTaskResult,
	taskTotals: { documents: number; requests: number }
): void {
	result.totalDocuments += fetchResult.documentCount;
	result.totalRequests += fetchResult.requestCount;
	// The same numbers, attributed to the task that actually fetched them, so a declarer
	// reports ITS OWN transfer rather than the whole tick's.
	taskTotals.documents += fetchResult.documentCount;
	taskTotals.requests += fetchResult.requestCount;
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
		...emptyPersistedSchedulerTaskRunnerResult(),
		scanned: taskStates.length,
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
			result.tasks.push({
				taskId: runnableState.taskId,
				requirementId: runnableState.requirementId,
				collection: runnableState.collection,
				queryKey: runnableState.queryKey,
				kind: 'claim-lost',
				documents: 0,
				requests: 0,
			});
			continue;
		}
		activeState = claimedState;

		const task = taskFromState(runnableState);
		const maxRequests = maxRequestsForTask(input, task, runnableState);
		let taskCompleted = false;
		let requests = 0;
		const taskTotals = { documents: 0, requests: 0 };
		const recordOutcome = (kind: PersistedSchedulerTaskOutcomeKind): void => {
			result.tasks.push({
				taskId: runnableState.taskId,
				requirementId: runnableState.requirementId,
				collection: runnableState.collection,
				queryKey: runnableState.queryKey,
				kind,
				documents: taskTotals.documents,
				requests: taskTotals.requests,
			});
		};

		// The lease outlives a page only if it is renewed DURING the page, not just between
		// pages: on a starved server one fetch can take longer than the whole lease
		// (observed live 2026-08-12 — 30s pages against the 30s lease), at which point a
		// concurrent drain claims the row and both owners walk the same window against a
		// server that is already struggling. The heartbeat keeps the claim fresh while a
		// fetch is in flight, so a lease expiry now means its owner is actually gone.
		let heartbeatLost = false;
		// Strictly shorter than ANY lease (#1175 review P2): a floor above leaseForMs/3
		// would schedule the first beat after a short lease already expired, silently
		// re-opening the mid-fetch steal window this heartbeat exists to close.
		const heartbeatIntervalMs = Math.max(1, Math.floor(input.leaseForMs / 3));
		const fetchWithLeaseHeartbeat = async (): Promise<FetchTaskResult> => {
			let stopped = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			// Beats chain onto `settled` so stop() can await the one in flight — the loop
			// below reads and CASes `activeState`, which a half-finished beat also writes.
			let settled: Promise<void> = Promise.resolve();
			const beat = (): void => {
				timer = setTimeout(() => {
					settled = settled.then(async () => {
						if (stopped || heartbeatLost) return;
						try {
							const renewedAtMs = currentTime(input);
							const renewedState = renewState(activeState, input, renewedAtMs);
							const renewed = await input.repository.claim(activeState, renewedState);
							if (!renewed) {
								heartbeatLost = true;
								return;
							}
							activeState = renewedState;
						} catch {
							// A storage hiccup skips this beat; the between-page renewal still guards.
						}
						if (!stopped && !heartbeatLost) beat();
					});
				}, heartbeatIntervalMs);
			};
			beat();
			try {
				return input.signal
					? await input.fetcher(task, { signal: input.signal })
					: await input.fetcher(task);
			} finally {
				stopped = true;
				if (timer !== undefined) clearTimeout(timer);
				await settled;
			}
		};

		const executeTask = async (): Promise<void> => {
			while (!taskCompleted) {
				throwIfAborted(input.signal);
				requests += 1;
				const fetchResult = await fetchWithLeaseHeartbeat();
				recordFetchResult(result, fetchResult, taskTotals);
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

				if (heartbeatLost) {
					// The claim went to another owner mid-fetch. This page's writes landed and
					// are counted above, but completing — or walking on — would fight the new
					// owner for the row. Stop as renewal-lost; the browse-window continuation
					// lets the new owner serve the covered prefix instead of re-fetching it.
					taskCompleted = false;
					result.renewalLost += 1;
					break;
				}

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
		};
		try {
			if (input.withTaskActivity) await input.withTaskActivity(task, executeTask);
			else await executeTask();
		} catch (error) {
			if (input.signal?.aborted) {
				try {
					await input.repository.claim(
						activeState,
						releasedClaimState(activeState, currentTime(input))
					);
				} catch {
					// Releasing is best-effort; the original abort must still propagate.
				}
				throw error;
			}

			// A tagged ledger refusal is not a task failure: the derivable ledger
			// (including this runner's own claim rows) is about to be rebuilt, so
			// marking the task failed would write into the store the rebuild drops.
			// Rethrow so withSchedulerDrainLedgerRecovery aborts the whole tick
			// cleanly (#956; #1187 review).
			if (isLedgerReconciliationRefusalError(error)) throw error;

			const failedAtMs = currentTime(input);
			const failed = await input.repository.markFailed(
				activeState,
				failedState(activeState, input, failedAtMs)
			);
			if (!failed) {
				result.failureLost += 1;
				recordOutcome('failure-lost');
				continue;
			}
			result.failed += 1;
			recordOutcome('failed');
			continue;
		}

		// Reachable only via the lease-renewal break above: the walk stopped short without
		// throwing. Previously this exited with NO counter and no trace at all.
		if (!taskCompleted) {
			recordOutcome('renewal-lost');
			continue;
		}

		const completedAtMs = currentTime(input);
		const completionOutcome = await input.repository.completeOrRequeue(
			activeState,
			completedState(activeState, completedAtMs),
			requeuedState(activeState, completedAtMs)
		);
		if (completionOutcome === 'claim-lost') {
			result.completionLost += 1;
			recordOutcome('completion-lost');
			continue;
		}
		// Both 'completed' and 'requeued' successfully handled the task; a requeue means a
		// change arrived mid-flight, so a fresh run was queued to catch it (#318).
		result.succeeded += 1;
		if (completionOutcome === 'requeued') result.coalescedReruns += 1;
		recordOutcome('succeeded');
	}

	return result;
}
