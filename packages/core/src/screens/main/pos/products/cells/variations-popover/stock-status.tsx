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
 * The badge, popover Add to Cart gate and cart guard must agree on the stock
 * owner: the variation when self-managed, otherwise the managed parent.
 * The journal keeps that parent record fresh, not the child's inherited status.
 * When neither manages stock, the child's stock_status governs.
 */
export function useVariationStock(
	variation: EngineRecord<'variations'>,
	parent: EngineRecord<'products'>
): ResolvedStock {
	const manageStock = useRecordField(variation, (record) => record.payload.manage_stock);
	const stockQuantity = useRecordField(variation, (record) => record.payload.stock_quantity);
	const stockStatus = useRecordField(variation, (record) => record.payload.stock_status);
	const backorders = useRecordField(variation, (record) => record.payload.backorders);
	const parentManageStock = useRecordField(parent, (record) => record.payload.manage_stock);
	const parentStockQuantity = useRecordField(parent, (record) => record.payload.stock_quantity);
	const parentStockStatus = useRecordField(parent, (record) => record.payload.stock_status);
	const parentBackorders = useRecordField(parent, (record) => record.payload.backorders);

	const variationOwnsStock = manageStock === true;
	const parentOwnsStock = !variationOwnsStock && parentManageStock === true;
	return resolveStock(
		parentOwnsStock
			? {
					manage_stock: true,
					stock_quantity: parentStockQuantity,
					stock_status: parentStockStatus,
					backorders: parentBackorders,
				}
			: {
					manage_stock: manageStock,
					stock_quantity: stockQuantity,
					stock_status: stockStatus,
					backorders,
				}
	);
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
