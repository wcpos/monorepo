import { mintRemoteId } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineQuery } from './engine-query';
import { observeCollectionActive } from './engine-status';
import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	type DemandPlan,
	type QueryHandle,
} from './query-handle';

import type { QueryResult } from './query-result';

type RefundsResult = QueryResult;

// Demand ids are the handle's own: a successor handle (a reset) declares beside its predecessor.
let nextHandleId = 0;

/**
 * An order's refunds as a query handle (roadmap#423): the local read of the refunds whose
 * parent is the order, newest first, and a FORCED by-parent pull standing while owned. Every
 * declaration the plan makes is forced — the standing one, a `declareOnce` re-arm (the
 * boundary's Retry) and a new handle's after a reset — so the detail always asks the server.
 */
export function acquireOrderRefundsQueryHandle(
	engine: RxdbSyncEngine,
	key: string,
	orderId: number
): QueryHandle<RefundsResult> {
	return acquireQueryHandle(engine, key, (registry) => {
		const id = `refunds:order-detail:${orderId}:${nextHandleId++}`;
		const plan: DemandPlan = {
			collection: 'refunds',
			requirementsFor: ({ id: requirementId, priority }) => [
				{
					id: `${requirementId}:refunds-by-parent`,
					kind: 'refunds-by-parent',
					collection: 'refunds',
					parentRemoteId: mintRemoteId(orderId, 'refund parent'),
					forceRefresh: true,
					...(priority === undefined ? {} : { priority }),
				},
			],
			represented: false,
			isUnfiltered: false,
		};
		return createQueryHandle(
			engine,
			{
				key,
				result$: (target) =>
					observeEngineQuery(target, {
						collection: 'refunds',
						selector: { parent_id: orderId },
						sort: [{ date_created_gmt: 'desc' }],
						limit: Number.MAX_SAFE_INTEGER,
					}),
				demands: [createDemand(engine, id, plan)],
				activeCollections: ['refunds'],
				censusScoped: false,
				// Nothing reads a total from an order's refunds.
				projectsTotal: false,
				observeActive: observeCollectionActive,
			},
			{ searchActive: false, count: 0, hits: [] },
			registry
		);
	});
}
