import * as React from 'react';

import { StatusBadge, type StatusBadgeProps } from '@wcpos/components/status-badge';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { displayStockStatus } from '../../components/product/resolve-stock';
import { StatusFilterCell } from '../../components/status-filter-cell';
import { useStockStatusLabel } from '../../hooks/use-stock-status-label';

const stockTones: Record<string, StatusBadgeProps['variant']> = {
	instock: 'success',
	outofstock: 'error',
	lowstock: 'warning',
	onbackorder: 'warning',
};

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
	const { items } = useStockStatusLabel();
	return (
		<StatusFilterCell
			table={table}
			field="stock_status"
			value={stockStatus}
			options={items}
			tones={stockTones}
			testID="product-stock-status"
		/>
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
	return (
		<StatusBadge
			variant={stockTones[status ?? ''] ?? 'default'}
			label={`${quantity == null ? '' : `${quantity} · `}${getLabel(status ?? '')}`}
		/>
	);
}
