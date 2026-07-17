import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { StatusBadge } from '@wcpos/components/status-badge';

import { resolveVariationStock, type VariationStock } from './variation-stock';
import { useT } from '../../../../../../contexts/translations';
import { useNumberFormat } from '../../../../hooks/use-number-format';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

export { resolveVariationStock } from './variation-stock';
export type { VariationStock, VariationStockInput } from './variation-stock';

/**
 * Resolve the sellability of a single variation.
 *
 * When the variation manages its own stock, quantity + backorders decide and
 * stock_status is ignored (WooCommerce derives it). Otherwise (including
 * parent-managed stock) the stock_status flag governs and no quantity is shown.
 */
export function useVariationStock(variation: ProductVariationDocument): VariationStock {
	const manageStock = useObservableEagerState(variation.manage_stock$!);
	const stockQuantity = useObservableEagerState(variation.stock_quantity$!);
	const stockStatus = useObservableEagerState(variation.stock_status$!);
	const backorders = useObservableEagerState(variation.backorders$!);

	return resolveVariationStock({
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
export function VariationStockBadge({ stock }: { stock: VariationStock }) {
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
