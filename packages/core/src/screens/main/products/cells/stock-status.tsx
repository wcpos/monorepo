import * as React from 'react';

import { ButtonPill } from '@wcpos/components/button';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { displayStockStatus } from '../../components/product/resolve-stock';
import { useStockStatusLabel } from '../../hooks/use-stock-status-label';

import type { QueryStateActions } from '../../../../query';

/**
 *
 */
export function StockStatus({
	table,
	row,
}: CellContext<{ record: EngineRecord<'products'> }, 'stock_status'>) {
	// Derived at read time so a quantity edit flips the badge the moment the
	// optimistic patch lands — payload.stock_status is a server-computed echo
	// that only updates when the push acks (0–10s later, never offline).
	const stockStatus = useRecordField(row.original.record, (product) =>
		displayStockStatus(product.payload)
	);
	const { getLabel } = useStockStatusLabel();
	const meta = table.options.meta as unknown as {
		actions: Pick<QueryStateActions<'products'>, 'setFilter'>;
	};

	const variant = React.useMemo(() => {
		switch (stockStatus) {
			case 'instock':
				return 'ghost-success';
			case 'outofstock':
				return 'ghost-destructive';
			case 'onbackorder':
				return 'ghost-warning';
			case 'lowstock':
				return 'ghost-warning';
			default:
				return 'ghost';
		}
	}, [stockStatus]);

	return (
		<ButtonPill
			size="xs"
			variant={variant}
			onPress={() => {
				if (stockStatus) meta.actions.setFilter('stock_status', stockStatus);
			}}
		>
			{getLabel(stockStatus ?? '')}
		</ButtonPill>
	);
}
