import type { RemoteId } from '@wcpos/sync-core';

import { withSchedulerSeedLedgerRecovery } from '../local-coverage/ledger-storage-recovery';
import { refundHistoryQueryKey, refundParentQueryKey } from './refund-lane-descriptor';
import { seedPersistedSchedulerTasks } from './rx-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

import type { SeedPosBootstrapLanesInput } from './rx-pos-bootstrap-seeder';

function seedRefundLane(
	queryKey: string,
	input: SeedPosBootstrapLanesInput,
	coalesceInFlight = false
) {
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(input.database),
				tasks: [
					{
						id: `${queryKey}:greedy`,
						requirementId: queryKey,
						collection: 'refunds',
						queryKey,
						limit: WOO_REST_MAX_PER_PAGE,
						priority: 910,
						mode: 'greedy',
					},
				],
				nowMs: input.nowMs ?? Date.now(),
				completedDedupeForMs: input.completedDedupeForMs ?? 0,
				coalesceInFlight,
				wakeFailed: input.completedDedupeForMs === 0,
			}),
	});
}

export const seedRefundWindowLane = (input: SeedPosBootstrapLanesInput) =>
	seedRefundLane(refundHistoryQueryKey(), input);
export const seedRefundParentLane = (
	input: SeedPosBootstrapLanesInput & { parentRemoteId: RemoteId; coalesceInFlight?: boolean }
) => seedRefundLane(refundParentQueryKey(input.parentRemoteId), input, input.coalesceInFlight);
