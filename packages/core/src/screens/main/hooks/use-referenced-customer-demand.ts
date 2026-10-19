import * as React from 'react';

import { useSubscription } from 'observable-hooks';
import { Observable } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { type EngineRecord, useQueryRuntime } from '@wcpos/query';
import { demandRecordsByWooId } from '@wcpos/query/record-readers';
import { useCoverageGeneration } from '@wcpos/query/query-state';
import { wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { parseRemoteId } from '../../../utils/parse-remote-id';

type OrdersResult = {
	hits: { record?: Pick<EngineRecord<'orders'>, 'payload'> }[];
};
const logger = getLogger(['wcpos', 'orders', 'referenced-customer-demand']);
const isPositiveInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value > 0;
function referencedIds(result: OrdersResult): number[] {
	const ids = new Set<number>();
	for (const { record } of result.hits) {
		if (!record) continue;
		if (isPositiveInteger(record.payload.customer_id)) ids.add(record.payload.customer_id);
		const cashierId = parseRemoteId(
			wooMetaCarrier.readIdentity(record.payload.meta_data).cashierId
		);
		if (isPositiveInteger(cashierId)) ids.add(cashierId);
	}
	return [...ids].sort((a, b) => a - b);
}
export function useReferencedCustomerDemand(result$: Observable<OrdersResult>): void {
	const runtime = useQueryRuntime();
	const generation = useCoverageGeneration(runtime.engine, 'customers');
	// The same identity as useScopeKey: a reset or store switch gets a fresh set.
	// Late completions only mark the outgoing scope's set.
	const [attempts, setAttempts] = React.useState(() => ({
		engine: runtime.engine,
		generation,
		ids: new Set<number>(),
	}));
	let attemptedIds = attempts.ids;
	if (attempts.engine !== runtime.engine || attempts.generation !== generation) {
		attemptedIds = new Set<number>();
		setAttempts({ engine: runtime.engine, generation, ids: attemptedIds });
	}
	const demand$ = React.useMemo(
		() =>
			result$.pipe(
				map(referencedIds),
				map((ids) => ({ ids, key: ids.join(',') })),
				distinctUntilChanged((previous, current) => previous.key === current.key),
				map(({ ids }) => ids.filter((id) => !attemptedIds.has(id))),
				switchMap(
					(ids) =>
						new Observable<void>(() => {
							// An empty (or fully-attempted) set still flows through switchMap so
							// the previous requirement is released; it just requests nothing new.
							if (ids.length === 0) return;
							const requirement = demandRecordsByWooId(runtime.engine, {
								id: `orders:referenced-customers:${ids.join(',')}`,
								collection: 'customers',
								wooIds: ids,
							});
							// Attempted only when the requirement settles successfully.
							// A 'released' outcome means switchMap superseded this requirement
							// mid-flight — those ids re-enter the next requirement unmarked, so
							// growing the visible set never strands an in-flight customer.
							void requirement.ready
								.then((outcome) => {
									if (outcome !== 'released') {
										ids.forEach((id) => attemptedIds.add(id));
									}
								})
								.catch(() => {
									logger.debug('Referenced customer demand failed');
								});
							return () => requirement.release();
						})
				)
			),
		[runtime.engine, result$, attemptedIds]
	);
	useSubscription(demand$);
}
