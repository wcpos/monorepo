import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';
import type { CellContext } from '@wcpos/core/table-types';

import { useCashierLabel } from '../../hooks/use-cashier-label';

import type { QueryStateActions } from '../../../../query';

/**
 *
 */
export function Cashier({
	table,
	row,
}: CellContext<{ record: EngineRecord<'orders'> }, 'cashier'>) {
	const cashierID = useRecordField(
		row.original.record,
		({ payload }) => wooMetaCarrier.readIdentity(payload.meta_data).cashierId ?? undefined
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
		<Chip
			size="sm"
			label={cashier.label}
			onPress={() => actions?.setFilter('cashier', cashier.id)}
		/>
	);
}
