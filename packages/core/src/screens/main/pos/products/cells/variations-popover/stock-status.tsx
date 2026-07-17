import * as React from 'react';

import isFinite from 'lodash/isFinite';
import { useObservableEagerState } from 'observable-hooks';

import { StatusBadge } from '@wcpos/components/status-badge';

import { useT } from '../../../../../../contexts/translations';
import { useNumberFormat } from '../../../../hooks/use-number-format';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

export interface VariationStock {
	status: 'instock' | 'onbackorder' | 'outofstock';
	/** Quantity is only known when the variation manages its own stock */
	quantity: number | null;
	sellable: boolean;
}

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

	if (manageStock === true && isFinite(stockQuantity)) {
		if ((stockQuantity as number) > 0) {
			return { status: 'instock', quantity: stockQuantity as number, sellable: true };
		}
		if (backorders !== 'no') {
			return { status: 'onbackorder', quantity: null, sellable: true };
		}
		return { status: 'outofstock', quantity: null, sellable: false };
	}

	if (stockStatus === 'outofstock') {
		return { status: 'outofstock', quantity: null, sellable: false };
	}
	if (stockStatus === 'onbackorder') {
		return { status: 'onbackorder', quantity: null, sellable: true };
	}
	return { status: 'instock', quantity: null, sellable: true };
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
