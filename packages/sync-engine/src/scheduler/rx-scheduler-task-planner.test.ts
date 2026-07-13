// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	planAndPersistSchedulerTasks,
	type SchedulerTaskPlannerRepository,
} from './rx-scheduler-task-planner';

import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';
import type { FetchTask } from './replication-policy';

function task(overrides: Partial<FetchTask> = {}): FetchTask {
	return {
		id: 'orders:custom-pull:windowed',
		requirementId: 'orders.custom-pull',
		collection: 'orders',
		queryKey: 'orders:custom-pull',
		limit: 25,
		priority: 600,
		mode: 'windowed',
		...overrides,
	};
}

function state(overrides: Partial<PersistedSchedulerTaskState> = {}): PersistedSchedulerTaskState {
	return {
		taskId: 'orders:custom-pull:windowed',
		requirementId: 'orders.custom-pull',
		collection: 'orders',
		queryKey: 'orders:custom-pull',
		limit: 25,
		priority: 600,
		mode: 'windowed',
		status: 'failed',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 1,
		retryAfterMs: 900,
		updatedAtMs: 800,
		...overrides,
	};
}

function repository(
	existingStates: PersistedSchedulerTaskState[] = [],
	claimNew = true,
	claim = true
): SchedulerTaskPlannerRepository {
	return {
		readForTaskIds: vi.fn(async () => existingStates),
		claimNew: vi.fn(async () => claimNew),
		claim: vi.fn(async () => claim),
	};
}

describe('planAndPersistSchedulerTasks', () => {
	it('insert-claims new scheduler task states and returns only acquired claims for runner handoff', async () => {
		const repo = repository();

		const result = await planAndPersistSchedulerTasks({
			repository: repo,
			tasks: [task()],
			ownerId: 'tab-a',
			nowMs: 1_000,
			claimForMs: 5_000,
		});

		const claimedState = state({
			status: 'in-flight',
			ownerId: 'tab-a',
			claimedUntilMs: 6_000,
			attempt: 1,
			retryAfterMs: null,
			updatedAtMs: 1_000,
		});
		expect(repo.readForTaskIds).toHaveBeenCalledWith(['orders:custom-pull:windowed']);
		expect(repo.claimNew).toHaveBeenCalledWith(claimedState);
		expect(repo.claim).not.toHaveBeenCalled();
		expect(result.claimedStates).toEqual([claimedState]);
	});

	it('uses guarded claims for existing runnable states and omits claims lost to another owner', async () => {
		const existing = state({
			status: 'in-flight',
			ownerId: 'tab-b',
			claimedUntilMs: 900,
			attempt: 2,
			retryAfterMs: null,
			updatedAtMs: 800,
		});
		const repo = repository([existing], true, false);

		const result = await planAndPersistSchedulerTasks({
			repository: repo,
			tasks: [task()],
			ownerId: 'tab-a',
			nowMs: 1_000,
			claimForMs: 5_000,
		});

		const nextClaim = state({
			status: 'in-flight',
			ownerId: 'tab-a',
			claimedUntilMs: 6_000,
			attempt: 3,
			retryAfterMs: null,
			updatedAtMs: 1_000,
		});
		expect(repo.claimNew).not.toHaveBeenCalled();
		expect(repo.claim).toHaveBeenCalledWith(existing, nextClaim);
		expect(result.plan.claimed).toEqual([
			{ taskId: 'orders:custom-pull:windowed', reason: 'expired-owner' },
		]);
		expect(result.claimedStates).toEqual([]);
	});
});
