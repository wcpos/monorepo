// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	type PersistedSchedulerTaskState,
	planPersistedSchedulerTaskStates,
} from './persisted-scheduler-state';

import type { FetchTask } from './replication-policy';

function task(overrides: Partial<FetchTask> & Pick<FetchTask, 'id' | 'requirementId'>): FetchTask {
	return {
		id: overrides.id,
		requirementId: overrides.requirementId,
		collection: overrides.collection ?? 'orders',
		queryKey: overrides.queryKey ?? overrides.id,
		ids: overrides.ids,
		wooIds: overrides.wooIds,
		limit: overrides.limit ?? 25,
		priority: overrides.priority ?? 500,
		mode: overrides.mode ?? 'windowed',
	};
}

function state(
	overrides: Partial<PersistedSchedulerTaskState> &
		Pick<PersistedSchedulerTaskState, 'taskId' | 'requirementId'>
): PersistedSchedulerTaskState {
	return {
		taskId: overrides.taskId,
		requirementId: overrides.requirementId,
		collection: overrides.collection ?? 'orders',
		queryKey: overrides.queryKey ?? overrides.taskId,
		ids: overrides.ids,
		limit: overrides.limit ?? 25,
		priority: overrides.priority ?? 500,
		mode: overrides.mode ?? 'windowed',
		status: overrides.status ?? 'queued',
		ownerId: overrides.ownerId ?? null,
		claimedUntilMs: overrides.claimedUntilMs ?? null,
		attempt: overrides.attempt ?? 0,
		retryAfterMs: overrides.retryAfterMs ?? null,
		updatedAtMs: overrides.updatedAtMs ?? 1_000,
	};
}

describe('planPersistedSchedulerTaskStates', () => {
	it('persists and claims new scheduler tasks for the current owner', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 2_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [],
		});

		expect(result.claimed.map((item) => item.taskId)).toEqual(['orders:open:windowed']);
		expect(result.states).toEqual([
			expect.objectContaining({
				taskId: 'orders:open:windowed',
				status: 'in-flight',
				ownerId: 'tab-a',
				claimedUntilMs: 7_000,
				attempt: 1,
				updatedAtMs: 2_000,
			}),
		]);
	});

	it('persists the wooIds numeric channel onto the claimed state (survives rehydrate)', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 2_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [
				task({
					id: 'orders:ids:123,456:on-demand',
					requirementId: 'orders.deep-link',
					ids: ['woo-order:123', 'woo-order:456'],
					wooIds: [123, 456],
					mode: 'on-demand',
				}),
			],
			existingStates: [],
		});

		expect(result.states[0]).toEqual(expect.objectContaining({ wooIds: [123, 456] }));
	});

	it('waits when another tab owns an unexpired in-flight task', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 2_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [
				state({
					taskId: 'orders:open:windowed',
					requirementId: 'orders.open',
					status: 'in-flight',
					ownerId: 'tab-b',
					claimedUntilMs: 3_000,
					attempt: 1,
				}),
			],
		});

		expect(result.claimed).toEqual([]);
		expect(result.waiting).toEqual([
			{ taskId: 'orders:open:windowed', ownerId: 'tab-b', reason: 'active-owner' },
		]);
		expect(result.states[0]).toEqual(
			expect.objectContaining({ ownerId: 'tab-b', claimedUntilMs: 3_000, attempt: 1 })
		);
	});

	it('waits when the current tab already owns an unexpired in-flight task', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 2_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [
				state({
					taskId: 'orders:open:windowed',
					requirementId: 'orders.open',
					status: 'in-flight',
					ownerId: 'tab-a',
					claimedUntilMs: 3_000,
					attempt: 1,
				}),
			],
		});

		expect(result.claimed).toEqual([]);
		expect(result.waiting).toEqual([
			{ taskId: 'orders:open:windowed', ownerId: 'tab-a', reason: 'active-owner' },
		]);
		expect(result.states[0]).toEqual(
			expect.objectContaining({ ownerId: 'tab-a', claimedUntilMs: 3_000, attempt: 1 })
		);
	});

	it('takes over expired in-flight work after a reload or abandoned tab', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 4_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [
				state({
					taskId: 'orders:open:windowed',
					requirementId: 'orders.open',
					status: 'in-flight',
					ownerId: 'tab-b',
					claimedUntilMs: 3_000,
					attempt: 2,
				}),
			],
		});

		expect(result.claimed).toEqual([{ taskId: 'orders:open:windowed', reason: 'expired-owner' }]);
		expect(result.states[0]).toEqual(
			expect.objectContaining({
				ownerId: 'tab-a',
				claimedUntilMs: 9_000,
				attempt: 3,
				status: 'in-flight',
			})
		);
	});

	it('honors failed task retry backoff before reclaiming', () => {
		const beforeRetry = planPersistedSchedulerTaskStates({
			nowMs: 4_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [
				state({
					taskId: 'orders:open:windowed',
					requirementId: 'orders.open',
					status: 'failed',
					attempt: 2,
					retryAfterMs: 5_000,
				}),
			],
		});

		expect(beforeRetry.claimed).toEqual([]);
		expect(beforeRetry.waiting).toEqual([
			{ taskId: 'orders:open:windowed', ownerId: null, reason: 'retry-backoff' },
		]);

		const afterRetry = planPersistedSchedulerTaskStates({
			nowMs: 5_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: beforeRetry.states,
		});

		expect(afterRetry.claimed).toEqual([{ taskId: 'orders:open:windowed', reason: 'retry-ready' }]);
		expect(afterRetry.states[0]).toEqual(
			expect.objectContaining({
				status: 'in-flight',
				ownerId: 'tab-a',
				attempt: 3,
				retryAfterMs: null,
			})
		);
	});

	it('can explicitly override failed task retry backoff for manual work', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 4_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			ignoreRetryBackoff: true,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [
				state({
					taskId: 'orders:open:windowed',
					requirementId: 'orders.open',
					status: 'failed',
					attempt: 2,
					retryAfterMs: 5_000,
				}),
			],
		});

		expect(result.waiting).toEqual([]);
		expect(result.claimed).toEqual([{ taskId: 'orders:open:windowed', reason: 'retry-ready' }]);
		expect(result.states[0]).toEqual(
			expect.objectContaining({
				status: 'in-flight',
				ownerId: 'tab-a',
				attempt: 3,
				retryAfterMs: null,
			})
		);
	});

	it('coalesces duplicate task ids before planning durable state', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 2_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			tasks: [
				task({ id: 'orders:open:windowed', requirementId: 'orders.open', priority: 600 }),
				task({ id: 'orders:open:windowed', requirementId: 'orders.open.duplicate', priority: 500 }),
			],
			existingStates: [],
		});

		expect(result.claimed).toEqual([{ taskId: 'orders:open:windowed', reason: 'new-task' }]);
		expect(result.states).toHaveLength(1);
		expect(result.states[0]).toEqual(
			expect.objectContaining({ requirementId: 'orders.open', priority: 600 })
		);
	});

	it('keeps recently completed persisted work from being re-enqueued after reload', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 4_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			completedDedupeForMs: 2_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [
				state({
					taskId: 'orders:open:windowed',
					requirementId: 'orders.open',
					status: 'completed',
					updatedAtMs: 3_000,
				}),
			],
		});

		expect(result.claimed).toEqual([]);
		expect(result.completed).toEqual(['orders:open:windowed']);
		expect(result.states[0]).toEqual(
			expect.objectContaining({ status: 'completed', updatedAtMs: 3_000 })
		);
	});

	it('reclaims completed persisted work after the dedupe window expires', () => {
		const result = planPersistedSchedulerTaskStates({
			nowMs: 6_000,
			ownerId: 'tab-a',
			claimForMs: 5_000,
			completedDedupeForMs: 2_000,
			tasks: [task({ id: 'orders:open:windowed', requirementId: 'orders.open' })],
			existingStates: [
				state({
					taskId: 'orders:open:windowed',
					requirementId: 'orders.open',
					status: 'completed',
					updatedAtMs: 3_000,
					attempt: 1,
				}),
			],
		});

		expect(result.completed).toEqual([]);
		expect(result.claimed).toEqual([{ taskId: 'orders:open:windowed', reason: 'queued' }]);
		expect(result.states[0]).toEqual(
			expect.objectContaining({
				status: 'in-flight',
				ownerId: 'tab-a',
				claimedUntilMs: 11_000,
				attempt: 2,
			})
		);
	});
});
