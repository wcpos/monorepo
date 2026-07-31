import * as React from 'react';

import { useSubscription } from 'observable-hooks';
import { Observable } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { parseRemoteId } from '../../../utils/parse-remote-id';

type OrdersResult = {
	hits: { document: { customer_id?: unknown; meta_data?: { key?: string; value?: unknown }[] } }[];
};
const logger = getLogger(['wcpos', 'orders', 'referenced-customer-demand']);
const isPositiveInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value > 0;
function referencedIds(result: OrdersResult): number[] {
	const ids = new Set<number>();
	for (const { document } of result.hits) {
		if (isPositiveInteger(document.customer_id)) ids.add(document.customer_id);
		const cashier = document.meta_data?.find(({ key }) => key === '_pos_user');
		const cashierId = parseRemoteId(cashier?.value);
		if (isPositiveInteger(cashierId)) ids.add(cashierId);
	}
	return [...ids].sort((a, b) => a - b);
}
export function useReferencedCustomerDemand(result$: Observable<OrdersResult>): void {
	const { engine } = useQueryManager();
	// useState initializer (not useRef): the set is read inside the pipe's
	// callbacks, and react-compiler forbids ref reads in render scope.
	const [attemptedIds] = React.useState(() => new Set<number>());
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
							const requirement = engine.require({
								id: `orders:referenced-customers:${ids.join(',')}`,
								collection: 'customers',
								kind: 'targeted-records',
								wooIds: ids,
							});
							// Attempted only when the requirement settles successfully.
							// A 'released' outcome means switchMap superseded this requirement
							// mid-flight — those ids re-enter the next requirement unmarked, so
							// growing the visible set never strands an in-flight customer.
							void requirement.ready
								.then((outcome: { action?: string }) => {
									if (outcome?.action !== 'released') {
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
		[engine, result$, attemptedIds]
	);
	useSubscription(demand$);
}
