import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill } from '@wcpos/components/button';

import { useCashierLabel } from '../../hooks/use-cashier-label';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export function Cashier({ table, row }: CellContext<{ document: OrderDocument }, 'cashier'>) {
	const order = row.original.document;
	const cashierID = useObservableEagerState(
		order.meta_data$!.pipe(
			map((meta) => meta?.find((m: { key?: string; value?: string }) => m.key === '_pos_user')),
			map((m: { key?: string; value?: string } | undefined) => m?.value)
		)
	);
	const cashier = useCashierLabel(cashierID);
	const query = (
		table.options.meta as unknown as { query: ReturnType<typeof import('@wcpos/query').useQuery> }
	)?.query;

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
