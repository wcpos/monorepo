import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill } from '@wcpos/components/button';
import type { OrderCollection, OrderDocument } from '@wcpos/database';
import type { Query } from '@wcpos/query';

import { useCashierLabel } from '../../hooks/use-cashier-label';

import type { CellContext } from '@tanstack/react-table';

/**
 * Legacy reports cell. Delete when reports/orders migrates to query-state bindings.
 */
export function Cashier({ table, row }: CellContext<{ document: OrderDocument }, 'cashier'>) {
	const order = row.original.document;
	const cashierID = useObservableEagerState(
		order.meta_data$!.pipe(
			map((meta) => meta?.find((item) => item.key === '_pos_user')),
			map((item) => item?.value)
		)
	);
	const cashier = useCashierLabel(cashierID);
	const query = (table.options.meta as { query?: Query<OrderCollection> } | undefined)?.query;

	/**
	 * It's possible the order doesn't have a cashier, eg: web or admin orders.
	 */
	if (cashier.id === undefined) {
		return null;
	}

	return (
		<ButtonPill
			variant="ghost-secondary"
			size="xs"
			onPress={() =>
				query
					?.where('meta_data')
					.multipleElemMatch({ key: '_pos_user', value: String(cashier.id) })
					.exec()
			}
		>
			{cashier.label}
		</ButtonPill>
	);
}
