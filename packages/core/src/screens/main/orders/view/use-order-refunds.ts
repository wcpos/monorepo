import * as React from 'react';

import {
	acquireQueryHandle,
	createDemand,
	createQueryHandle,
	type DemandPlan,
	observeCollectionActive,
	observeEngineQuery,
	type QueryHandle,
	type QueryResult,
	useQueryRuntime,
} from '@wcpos/query';
import { mintRemoteId } from '@wcpos/sync-core';
import type { RxdbSyncEngine, WooRefundPayload } from '@wcpos/sync-engine';

import { canonicalQueryKey } from '../../../../query/query-handles';
import { useScopeKey } from '../../../../query/scope-key';

import type { RxCollection } from 'rxdb';

export type WCRefund = WooRefundPayload;

type RefundsResult = QueryResult<RxCollection>;

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

/**
 * The order's refunds handle, retained while the caller is mounted: the caller is the OWNER,
 * above the Suspense/error boundary it renders. Keyed on BOTH scope keys, so a reset of the
 * refunds collection or of the orders collection (a cascade empties the detail rows) is a new
 * handle, whose forced pull is declared before the old one releases.
 */
export function useOrderRefunds(orderId: number): QueryHandle<RefundsResult> {
	const { engine } = useQueryRuntime();
	const key = canonicalQueryKey([
		'refunds-by-parent',
		useScopeKey('refunds'),
		useScopeKey('orders'),
		orderId,
	]);
	const handle = React.useMemo(
		() => acquireOrderRefundsQueryHandle(engine, key, orderId),
		[engine, key, orderId]
	);
	React.useEffect(() => handle.retain(), [handle]);
	return handle;
}
