import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId, type SchedulerTaskStateDocument } from './testing';
import { RxSchedulerTaskStateRepository } from './scheduler/rx-scheduler-task-state-repository';

describe('resident order refresh outcomes', () => {
	it.each([
		{
			name: 'rejects ready when a forced refresh of a resident order has an owned failed task',
			forceRefresh: true,
			pullFails: true,
			action: null,
		},
		{
			name: 'fetches a resident order when its forced refresh task succeeds',
			forceRefresh: true,
			pullFails: false,
			action: 'fetched',
		},
		{
			name: 'serves a resident order locally without a pull when refresh is not forced',
			forceRefresh: false,
			pullFails: true,
			action: 'serve-local',
		},
	])('$name', async ({ forceRefresh, pullFails, action }) => {
		setPremiumFlag();
		let failPull = false;
		let pulls = 0;
		const harness = await createEngineHarness({
			fetch: async (url) => {
				if (!new URL(url).pathname.endsWith('/orders')) {
					throw new Error(`Unexpected request: ${url}`);
				}
				pulls += 1;
				if (failPull) return new Response('Service unavailable', { status: 503 });
				return Response.json([
					{
						id: 7,
						status: 'processing',
						total: '5.00',
						date_modified_gmt: '2026-07-10T00:00:01',
						meta_data: [
							{
								key: '_woocommerce_pos_uuid',
								value: '77777777-7777-4777-8777-777777777777',
							},
						],
					},
				]);
			},
		});
		try {
			await harness.engine.ready;
			const requirement = {
				id: 'resident-order',
				collection: 'orders' as const,
				kind: 'targeted-records' as const,
				remoteIds: [remoteId(7)],
			};
			await harness.engine.require(requirement).ready;
			expect(await harness.collection('orders').count().exec()).toBe(1);
			const pullsBefore = pulls;
			failPull = pullFails;
			const handle = harness.engine.require({ ...requirement, forceRefresh });
			try {
				if (action === null) {
					await expect(handle.ready).rejects.toThrow(
						'require: forced refresh failed 1 task(s) for 1 resident order(s)'
					);
				} else {
					await expect(handle.ready).resolves.toMatchObject({ action });
				}
				expect(pulls - pullsBefore).toBe(forceRefresh ? 1 : 0);
				expect(await harness.collection('orders').count().exec()).toBe(1);
			} finally {
				handle.release();
			}
		} finally {
			await harness.dispose();
		}
	});
});

const residentRequirement = {
	id: 'resident-refresh-review',
	collection: 'orders' as const,
	kind: 'targeted-records' as const,
	remoteIds: [remoteId(7)],
};

async function residentHarness() {
	setPremiumFlag();
	const wire = { fail: false, beforeResponse: async () => {} };
	const harness = await createEngineHarness({
		fetch: async (url) => {
			if (!new URL(url).pathname.endsWith('/orders')) throw new Error(`Unexpected: ${url}`);
			await wire.beforeResponse();
			if (wire.fail) return new Response('Service unavailable', { status: 503 });
			return Response.json([
				{
					id: 7,
					status: 'processing',
					total: '5.00',
					date_modified_gmt: '2026-07-10T00:00:01',
					meta_data: [
						{ key: '_woocommerce_pos_uuid', value: '77777777-7777-4777-8777-777777777777' },
					],
				},
			]);
		},
	});
	await harness.engine.require(residentRequirement).ready;
	const task = await harness
		.collection<SchedulerTaskStateDocument>('schedulerTaskStates')
		.findOne({ selector: { taskId: 'orders:ids:7:on-demand' } })
		.exec();
	if (!task) throw new Error('Missing resident order task');
	return { harness, wire, task };
}

describe('forced resident refresh requires its own completion', () => {
	it('rejects a second failed forced refresh inside the retry backoff window', async () => {
		const { harness, wire, task } = await residentHarness();
		try {
			wire.fail = true;
			const first = harness.engine.require({ ...residentRequirement, forceRefresh: true });
			await expect(first.ready).rejects.toThrow(/forced refresh failed/);
			first.release();
			expect(task.getLatest().status).toBe('failed');
			const requestsBefore = harness.requests.length;
			const second = harness.engine.require({ ...residentRequirement, forceRefresh: true });
			await expect(second.ready).rejects.toThrow(/forced refresh failed/);
			expect(harness.requests.length - requestsBefore).toBe(1);
			second.release();
		} finally {
			await harness.dispose();
		}
	});

	it.each([
		['completion-lost', false],
		['failure-lost', true],
	] as const)('releases an owned %s instead of fetching', async (_kind, fail) => {
		const { harness, wire, task } = await residentHarness();
		try {
			wire.fail = fail;
			// A peer takes the persisted claim while the real HTTP pull is in flight.
			wire.beforeResponse = async () => {
				await task.getLatest().incrementalPatch({ ownerId: 'peer-owner' });
			};
			await expect(
				harness.engine.require({ ...residentRequirement, forceRefresh: true }).ready
			).resolves.toMatchObject({ action: 'released', reason: 'claim lost to another owner' });
		} finally {
			await harness.dispose();
		}
	});

	it('waits for an active resident task elsewhere then resolves on its own completion', async () => {
		const { harness, task } = await residentHarness();
		let handle;
		try {
			await task.incrementalPatch({
				status: 'in-flight',
				ownerId: 'peer-owner',
				claimedUntilMs: harness.clock.now() + 60_000,
			});
			const requestsBefore = harness.requests.length;
			handle = harness.engine.require({ ...residentRequirement, forceRefresh: true });
			const early = await Promise.race([
				handle.ready.then(() => 'settled'),
				new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 30)),
			]);
			expect(early).toBe('pending');
			expect(harness.requests.length).toBe(requestsBefore);
			await task
				.getLatest()
				.incrementalPatch({ status: 'completed', ownerId: null, claimedUntilMs: null });
			await expect(handle.ready).resolves.toMatchObject({ action: 'fetched' });
			expect(harness.requests.length - requestsBefore).toBe(1);
		} finally {
			handle?.release();
			await harness.dispose();
		}
	});

	it('releases a forced resident refresh when its drain rebuilds the ledger', async () => {
		const { harness } = await residentHarness();
		// Fail the storage read, not the drain: exercise the real rebuild and aborted tick.
		const read = vi
			.spyOn(RxSchedulerTaskStateRepository.prototype, 'readRunnable')
			.mockRejectedValueOnce(new Error('index reconciliation refused: invalid index'));
		try {
			await expect(
				harness.engine.require({ ...residentRequirement, forceRefresh: true }).ready
			).resolves.toMatchObject({
				action: 'released',
				reason: 'local sync bookkeeping was rebuilt mid-drain',
			});
			expect(await harness.collection('schedulerTaskStates').count().exec()).toBe(0);
		} finally {
			read.mockRestore();
			await harness.dispose();
		}
	});
});
