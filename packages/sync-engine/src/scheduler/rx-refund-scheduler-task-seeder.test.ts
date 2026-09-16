import { afterEach, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { mintRemoteId } from '@wcpos/sync-core';

import { createEngineHarness } from '../testing';
import { seedRefundParentLane } from './rx-refund-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';

setPremiumFlag();
let sequence = 0;
afterEach(() => createEngineHarness.disposeTrackedEngines());

// Restore unconditional parent coalescing: foreground demand gets rerunRequested and serves local early.
it.each([false, true])(
	'coalesces active parent work only with explicit opt-in (%s)',
	async (coalesce) => {
		const h = await createEngineHarness({
			site: 'https://refund-seed.test',
			startAtMs: 1000,
			identity: { site: 'https://refund-seed.test', storeId: 1, cashierId: `seed-${++sequence}` },
		});
		const scope = await h.engine.whenActive();
		const input = {
			database: scope.database,
			parentRemoteId: mintRemoteId(42, 'test'),
			nowMs: 1000,
		};
		const seeded = await seedRefundParentLane(input);
		const repo = new RxSchedulerTaskStateRepository(scope.database);
		const [state] = await repo.readForTaskIds(seeded.taskIds);
		await repo.claim(state, {
			...state,
			status: 'in-flight',
			ownerId: 'active-walk',
			claimedUntilMs: 2000,
		});
		const result = await seedRefundParentLane({
			...input,
			...(coalesce ? { coalesceInFlight: true } : {}),
		});
		expect(result).toMatchObject(
			coalesce ? { rerunRequested: 1, skippedActive: 0 } : { rerunRequested: 0, skippedActive: 1 }
		);
		const [current] = await repo.readForTaskIds(seeded.taskIds);
		expect(current.rerunRequested ?? false).toBe(coalesce);
		if (!coalesce) {
			const handle = h.engine.require({
				id: 'foreground-parent',
				kind: 'refunds-by-parent',
				collection: 'refunds',
				parentRemoteId: input.parentRemoteId,
			});
			try {
				await expect(handle.ready).resolves.toMatchObject({ action: 'released' });
			} finally {
				handle.release();
			}
		}
	}
);
