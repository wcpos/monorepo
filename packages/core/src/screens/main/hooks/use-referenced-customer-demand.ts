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
	const demand$ = React.useMemo(
		() =>
			result$.pipe(
				map(referencedIds),
				map((ids) => ({ ids, key: ids.join(',') })),
				distinctUntilChanged((previous, current) => previous.key === current.key),
				switchMap(
					({ ids, key }) =>
						new Observable<void>(() => {
							if (ids.length === 0) return;
							const requirement = engine.require({
								id: `orders:referenced-customers:${key}`,
								collection: 'customers',
								kind: 'targeted-records',
								wooIds: ids,
							});
							void requirement.ready.catch(() => logger.debug('Referenced customer demand failed'));
							return () => requirement.release();
						})
				)
			),
		[engine, result$]
	);
	useSubscription(demand$);
}
