import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill } from '@wcpos/components/button';

import { useCashierLabel } from '../../hooks/use-cashier-label';

import type { QueryStateActions } from '../../../../query';
import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export function Cashier({ table, row }: CellContext<{ document: OrderDocument }, 'cashier'>) {
	const order = row.original.document;
	const cashierID = useObservableEagerState(
		order.meta_data$!.pipe(
			map((meta) => meta?.find((entry) => entry.key === '_pos_user')),
			map((entry) => (typeof entry?.value === 'string' ? entry.value : undefined))
		)
	);
	const cashier = useCashierLabel(cashierID);
	const actions = (
		table.options.meta as {
			actions?: Pick<QueryStateActions<'orders'>, 'setFilter'>;
		}
	)?.actions;

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
			onPress={() => actions?.setFilter('cashier', cashier.id)}
		>
			{cashier.label}
		</ButtonPill>
	);
}
