import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { calculateOrderTotals } from './calculate-order-totals';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export const useOrderTotals = () => {
	const { currentOrder } = useCurrentOrder();
	const { rates, taxRoundAtSubtotal } = useTaxRates();

	/**
	 *
	 */
	const lineItems = useObservableEagerState(currentOrder.line_items$);
	const feeLines = useObservableEagerState(currentOrder.fee_lines$);
	const shippingLines = useObservableEagerState(currentOrder.shipping_lines$);

	/**
	 *
	 */
	return React.useMemo(() => {
		const totals = calculateOrderTotals({
			lineItems,
			feeLines,
			shippingLines,
			taxRates: rates,
			taxRoundAtSubtotal,
		});

		// currentOrder.incrementalPatch({
		// 	discount_tax: totals.discount_tax,
		// 	discount_total: totals.discount_total,
		// 	shipping_tax: totals.shipping_tax,
		// 	shipping_total: totals.shipping_total,
		// 	cart_tax: totals.cart_tax,
		// 	total_tax: totals.total_tax,
		// 	total: totals.total,
		// 	tax_lines: totals.tax_lines,
		// });

		return totals;
	}, [lineItems, feeLines, shippingLines, rates, taxRoundAtSubtotal, currentOrder]);
};
