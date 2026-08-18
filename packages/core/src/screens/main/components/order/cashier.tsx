import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { ButtonPill } from '@wcpos/components/button';
import { wooMetaCarrier } from '@wcpos/sync-core';
import type { CellContext } from '@wcpos/core/table-types';

import { useCashierLabel } from '../../hooks/use-cashier-label';

import type { QueryStateActions } from '../../../../query';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export function Cashier({ table, row }: CellContext<{ document: OrderDocument }, 'cashier'>) {
	const order = row.original.document;
	/**
	 * Memoised on the document wrapper, not built inline.
	 *
	 * The engine adapter's `$` getter returns a NEW observable on every property access, so
	 * `order.meta_data$` is a fresh stream each time it is read — an inline `.pipe()` here
	 * resubscribed on every render, for every visible order row. `order` is the right key:
	 * the wrapper is replaced exactly when the underlying document changes, so the stream is
	 * rebuilt when it must be and never merely because the cell re-rendered.
	 */
	const cashierID$ = React.useMemo(
		() =>
			order.meta_data$!.pipe(
				map((meta) => wooMetaCarrier.readIdentity(meta).cashierId ?? undefined)
			),
		[order]
	);
	const cashierID = useObservableEagerState(cashierID$);
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
