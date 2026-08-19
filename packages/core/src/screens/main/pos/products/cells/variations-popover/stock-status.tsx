import * as React from 'react';

import { StatusBadge } from '@wcpos/components/status-badge';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { type ResolvedStock, resolveStock } from '../../../../components/product/resolve-stock';
import { useT } from '../../../../../../contexts/translations';
import { useNumberFormat } from '../../../../hooks/use-number-format';

export { resolveStock } from '../../../../components/product/resolve-stock';
export type {
	ResolvedStock,
	ResolveStockInput,
} from '../../../../components/product/resolve-stock';

/**
 * Resolve the sellability of a single variation.
 *
 * When the variation manages its own stock, quantity + backorders decide and
 * stock_status is ignored (WooCommerce derives it). Otherwise (including
 * parent-managed stock) the stock_status flag governs and no quantity is shown.
 */
export function useVariationStock(variation: EngineRecord<'variations'>): ResolvedStock {
	const manageStock = useRecordField(variation, (record) => record.payload.manage_stock);
	const stockQuantity = useRecordField(variation, (record) => record.payload.stock_quantity);
	const stockStatus = useRecordField(variation, (record) => record.payload.stock_status);
	const backorders = useRecordField(variation, (record) => record.payload.backorders);

	return resolveStock({
		manage_stock: manageStock,
		stock_quantity: stockQuantity,
		stock_status: stockStatus,
		backorders,
	});
}

/**
 * Stock badge for a resolved variation. Renders nothing for a sellable
 * variation with no managed quantity (no numbers when stock isn't managed).
 */
export function VariationStockBadge({ stock }: { stock: ResolvedStock }) {
	const { format } = useNumberFormat();
	const t = useT();

	if (stock.status === 'outofstock') {
		return (
			<StatusBadge
				testID="variation-popover-stock-badge"
				variant="error"
				className="self-start"
				label={t('common.out_of_stock')}
			/>
		);
	}

	if (stock.status === 'onbackorder') {
		return (
			<StatusBadge
				testID="variation-popover-stock-badge"
				variant="warning"
				className="self-start"
				label={t('common.on_backorder')}
			/>
		);
	}

	if (stock.quantity === null) {
		return null;
	}

	return (
		<StatusBadge
			testID="variation-popover-stock-badge"
			variant="success"
			className="self-start"
			label={t('pos_products.in_stock', { quantity: format(stock.quantity) })}
		/>
	);
}
