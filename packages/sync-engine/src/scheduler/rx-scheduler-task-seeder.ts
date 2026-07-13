import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';
import type { FetchTask } from './replication-policy';
import type { RerunOrReseedOutcome } from './rx-scheduler-task-state-repository';

export type SchedulerTaskSeederRepository = {
	readForTaskIds(taskIds: string[]): Promise<PersistedSchedulerTaskState[]>;
	claimNew(state: PersistedSchedulerTaskState): Promise<boolean>;
	claim(
		expectedState: PersistedSchedulerTaskState,
		queuedState: PersistedSchedulerTaskState
	): Promise<boolean>;
	requestRerunOrReseed(
		expectedInFlight: PersistedSchedulerTaskState,
		reseededState: PersistedSchedulerTaskState,
		nowMs: number
	): Promise<RerunOrReseedOutcome>;
};

export type SeedPersistedSchedulerTasksInput = {
	repository: SchedulerTaskSeederRepository;
	tasks: FetchTask[];
	nowMs: number;
	/**
	 * How long after a task COMPLETED to suppress an identical re-seed (absorbs UI
	 * request spam). A NON-POSITIVE value disables completed-dedupe entirely — used
	 * by change-signal pulls, where each seed is a fresh server mutation and a
	 * same-millisecond completion (delta 0, or a fixed injected clock) must still
	 * re-pull rather than be dropped by a `<= 0` window (codex review round-2).
	 */
	completedDedupeForMs: number;
	/**
	 * Opt in to change-signal coalescing (#318): when an in-flight task is re-seeded, flag
	 * it to re-run once on completion (the running fetch may have read past the change)
	 * instead of the default skippedActive drop. ONLY the change-signal greedy refresh lanes
	 * set this; everything else (bootstrap, F11, UI/query, targeted pulls) leaves it false.
	 */
	coalesceInFlight?: boolean;
};

export type SeedPersistedSchedulerTasksResult = {
	inserted: number;
	requeued: number;
	skippedActive: number;
	skippedCompleted: number;
	skippedRunnable: number;
	claimLost: number;
	/**
	 * Change-signal coalescing (#318): a fresh change arrived while the task was actively
	 * in-flight, so the running fetch was flagged to re-run once on completion (it may have
	 * read past the change). Replaces the old silent `skippedActive` drop for that case.
	 */
	rerunRequested: number;
};

function queuedStateFromTask(
	task: FetchTask,
	nowMs: number,
	attempt = 0
): PersistedSchedulerTaskState {
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
		attempt,
		retryAfterMs: null,
		updatedAtMs: nowMs,
	};
}

function taskPriority(left: FetchTask, right: FetchTask): number {
	return right.priority - left.priority || left.id.localeCompare(right.id);
}

function uniqueOrderedTasks(tasks: FetchTask[]): FetchTask[] {
	const byId = new Map<string, FetchTask>();
	for (const task of [...tasks].sort(taskPriority)) {
		if (!byId.has(task.id)) byId.set(task.id, task);
	}
	return [...byId.values()];
}

export async function seedPersistedSchedulerTasks(
	input: SeedPersistedSchedulerTasksInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const tasks = uniqueOrderedTasks(input.tasks);
	const existingStates = await input.repository.readForTaskIds(tasks.map((task) => task.id));
	const existingByTaskId = new Map(existingStates.map((state) => [state.taskId, state] as const));
	const result: SeedPersistedSchedulerTasksResult = {
		inserted: 0,
		requeued: 0,
		skippedActive: 0,
		skippedCompleted: 0,
		skippedRunnable: 0,
		claimLost: 0,
		rerunRequested: 0,
	};

	for (const task of tasks) {
		const existing = existingByTaskId.get(task.id);
		if (!existing) {
			const inserted = await input.repository.claimNew(queuedStateFromTask(task, input.nowMs));
			if (inserted) result.inserted += 1;
			else result.claimLost += 1;
			continue;
		}

		if (existing.status === 'completed') {
			// A non-positive window disables completed-dedupe (so a same-millisecond
			// completion is NOT treated as a duplicate); otherwise skip within the window.
			if (
				input.completedDedupeForMs > 0 &&
				input.nowMs - existing.updatedAtMs <= input.completedDedupeForMs
			) {
				result.skippedCompleted += 1;
				continue;
			}

			const requeued = await input.repository.claim(
				existing,
				queuedStateFromTask(task, input.nowMs, existing.attempt)
			);
			if (requeued) result.requeued += 1;
			else result.claimLost += 1;
			continue;
		}

		if (existing.status === 'in-flight') {
			// Coalescing (#318) is an EXPLICIT opt-in (coalesceInFlight) — only the change-signal
			// greedy refresh lanes set it. Every other caller (bootstrap startup, F11 periodic
			// reference refresh, UI/query seeds, targeted pulls) keeps the old skippedActive
			// behavior: an in-flight fetch already serves them, and re-seeding is not a server
			// mutation, so it must not force a redundant re-run. (Do NOT infer this from
			// completedDedupeForMs — bootstrap also uses a 0 window; codex review.)
			if (!input.coalesceInFlight) {
				result.skippedActive += 1;
				continue;
			}
			// Change-signal seed: don't silently drop the change. If the task is still actively
			// owned, flag it to re-run once on completion (the running fetch may have read past
			// this change); if it completed between our read and now, re-queue a fresh run.
			const outcome = await input.repository.requestRerunOrReseed(
				existing,
				queuedStateFromTask(task, input.nowMs, existing.attempt),
				input.nowMs
			);
			if (outcome === 'rerun-requested') result.rerunRequested += 1;
			else if (outcome === 'requeued') result.requeued += 1;
			else result.skippedActive += 1;
			continue;
		}

		result.skippedRunnable += 1;
	}

	return result;
}
