import * as React from 'react';
import { Pressable } from 'react-native';

import { StatusBadge } from '@wcpos/components/status-badge';
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

	return (
		<Pressable
			testID="product-stock-status"
			accessibilityRole="button"
			accessibilityLabel={getLabel(stockStatus ?? '')}
			className="min-h-11 justify-center"
			onPress={() => {
				if (stockStatus) meta.actions.setFilter('stock_status', stockStatus);
			}}
		>
			<ProductStockBadge status={stockStatus} />
		</Pressable>
	);
}

export function ProductStockBadge({
	status,
	quantity,
}: {
	status?: string;
	quantity?: number | null;
}) {
	const { getLabel } = useStockStatusLabel();
	const variant =
		status === 'instock'
			? 'success'
			: status === 'outofstock'
				? 'error'
				: status === 'lowstock' || status === 'onbackorder'
					? 'warning'
					: 'default';
	return (
		<StatusBadge
			variant={variant}
			label={`${quantity == null ? '' : `${quantity} · `}${getLabel(status ?? '')}`}
		/>
	);
}
