import {
	type PersistedSchedulerTaskState,
	type PersistedSchedulerTaskStatePlan,
	planPersistedSchedulerTaskStates,
} from './persisted-scheduler-state';

import type { FetchTask } from './replication-policy';

export type PersistedSchedulerStateScenario = {
	id: string;
	label: string;
	description: string;
	nowMs: number;
	ownerId: string;
	claimForMs: number;
	completedDedupeForMs?: number;
	tasks: FetchTask[];
	existingStates: PersistedSchedulerTaskState[];
};

export type PersistedSchedulerStateScenarioSummary = {
	scenarioId: string;
	action: 'claim' | 'wait' | 'take-over' | 'skip-completed';
	claimed: string[];
	waiting: string[];
	completed: string[];
	nextStatuses: string[];
};

const openOrdersTask: FetchTask = {
	id: 'orders:open:windowed',
	requirementId: 'orders.open',
	collection: 'orders',
	queryKey: 'orders:status:open',
	limit: 25,
	priority: 600,
	mode: 'windowed',
};

function existingOpenOrdersState(
	overrides: Partial<PersistedSchedulerTaskState>
): PersistedSchedulerTaskState {
	return {
		taskId: openOrdersTask.id,
		requirementId: openOrdersTask.requirementId,
		collection: openOrdersTask.collection,
		queryKey: openOrdersTask.queryKey,
		ids: openOrdersTask.ids,
		limit: openOrdersTask.limit,
		priority: openOrdersTask.priority,
		mode: openOrdersTask.mode,
		status: 'queued',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 0,
		retryAfterMs: null,
		updatedAtMs: 1_000,
		...overrides,
	};
}

export const persistedSchedulerStateScenarios: PersistedSchedulerStateScenario[] = [
	{
		id: 'new-query-task-claim',
		label: 'New query task · claim locally',
		description:
			'A freshly scheduled query lane is persisted and claimed by the current tab so it can survive reload bookkeeping.',
		nowMs: 2_000,
		ownerId: 'tab-a',
		claimForMs: 5_000,
		tasks: [openOrdersTask],
		existingStates: [],
	},
	{
		id: 'active-owner-wait',
		label: 'Existing task · active owner',
		description:
			'Another tab has a non-expired lease, so this tab waits instead of duplicating remote Woo work.',
		nowMs: 2_000,
		ownerId: 'tab-a',
		claimForMs: 5_000,
		tasks: [openOrdersTask],
		existingStates: [
			existingOpenOrdersState({
				status: 'in-flight',
				ownerId: 'tab-b',
				claimedUntilMs: 3_000,
				attempt: 1,
			}),
		],
	},
	{
		id: 'expired-owner-takeover',
		label: 'Existing task · expired owner',
		description:
			'An abandoned tab left an expired in-flight lease, so the current tab can take over and increment the attempt.',
		nowMs: 4_000,
		ownerId: 'tab-a',
		claimForMs: 5_000,
		tasks: [openOrdersTask],
		existingStates: [
			existingOpenOrdersState({
				status: 'in-flight',
				ownerId: 'tab-b',
				claimedUntilMs: 3_000,
				attempt: 2,
			}),
		],
	},
	{
		id: 'failed-task-backoff',
		label: 'Failed task · retry backoff',
		description: 'Failed work remains durable but is not reclaimed until its retry window opens.',
		nowMs: 4_000,
		ownerId: 'tab-a',
		claimForMs: 5_000,
		tasks: [openOrdersTask],
		existingStates: [
			existingOpenOrdersState({ status: 'failed', attempt: 2, retryAfterMs: 5_000 }),
		],
	},
	{
		id: 'completed-task-dedupe',
		label: 'Completed task · reload dedupe',
		description:
			'Completed durable work is retained so a reload does not immediately enqueue duplicate remote fetch work.',
		nowMs: 4_000,
		ownerId: 'tab-a',
		claimForMs: 5_000,
		completedDedupeForMs: 2_000,
		tasks: [openOrdersTask],
		existingStates: [existingOpenOrdersState({ status: 'completed', updatedAtMs: 3_000 })],
	},
];

export function runPersistedSchedulerStateScenario(
	scenario: PersistedSchedulerStateScenario
): PersistedSchedulerTaskStatePlan {
	return planPersistedSchedulerTaskStates(scenario);
}

export function summarizePersistedSchedulerStateScenarios(
	scenarios: PersistedSchedulerStateScenario[] = persistedSchedulerStateScenarios
): PersistedSchedulerStateScenarioSummary[] {
	return scenarios.map((scenario) => {
		const result = runPersistedSchedulerStateScenario(scenario);
		return {
			scenarioId: scenario.id,
			action: summarizeAction(result),
			claimed: result.claimed.map((claim) => requirementLabel(result, claim.taskId)),
			waiting: result.waiting.map(
				(wait) => `${requirementLabel(result, wait.taskId)}:${wait.reason}:${wait.ownerId ?? '—'}`
			),
			completed: result.completed.map((taskId) => requirementLabel(result, taskId)),
			nextStatuses: result.states.map(
				(state) => `${state.requirementId}:${state.status}:${state.ownerId ?? '—'}`
			),
		};
	});
}

function summarizeAction(
	result: PersistedSchedulerTaskStatePlan
): PersistedSchedulerStateScenarioSummary['action'] {
	if (result.claimed.some((claim) => claim.reason === 'expired-owner')) return 'take-over';
	if (result.claimed.length > 0) return 'claim';
	if (result.waiting.length > 0) return 'wait';
	return 'skip-completed';
}

function requirementLabel(result: PersistedSchedulerTaskStatePlan, taskId: string): string {
	return result.states.find((state) => state.taskId === taskId)?.requirementId ?? taskId;
}
