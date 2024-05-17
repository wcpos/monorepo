import * as React from 'react';

import pick from 'lodash/pick';
import useDeepCompareEffect from 'use-deep-compare-effect';

import { calculateOrderTotals } from './calculate-order-totals';
import { useCartLines } from './use-cart-lines';
import { useTaxRates } from '../../contexts/tax-rates';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export const useOrderTotals = () => {
	const { currentOrder } = useCurrentOrder();
	const { allRates, taxRoundAtSubtotal } = useTaxRates();
	const { localPatch } = useLocalMutation();
	const { line_items, fee_lines, shipping_lines } = useCartLines();

	/**
	 *
	 */
	const totals = React.useMemo(() => {
		const totals = calculateOrderTotals({
			lineItems: line_items,
			feeLines: fee_lines,
			shippingLines: shipping_lines,
			taxRates: allRates, // NOTE: rates are not used for calc, just to get the tax rate label
			taxRoundAtSubtotal,
		});

		return totals;
	}, [line_items, fee_lines, shipping_lines, allRates, taxRoundAtSubtotal]);

	/**
	 *
	 */
	useDeepCompareEffect(() => {
		/**
		 * This will always patch on the first render, but we don't want to update the date_modified_gmt
		 * So, only patch if the totals have been modified.
		 */
		const currentTotals = pick(currentOrder, [
			'discount_tax',
			'discount_total',
			'shipping_tax',
			'shipping_total',
			'cart_tax',
			'total_tax',
			'total',
			'tax_lines',
		]);

		const newTotals = pick(totals, [
			'discount_tax',
			'discount_total',
			'shipping_tax',
			'shipping_total',
			'cart_tax',
			'total_tax',
			'total',
			'tax_lines',
		]);

		if (JSON.stringify(currentTotals) === JSON.stringify(newTotals)) {
			return;
		}

		localPatch({
			document: currentOrder,
			data: {
				discount_tax: totals.discount_tax,
				discount_total: totals.discount_total,
				shipping_tax: totals.shipping_tax,
				shipping_total: totals.shipping_total,
				cart_tax: totals.cart_tax,
				total_tax: totals.total_tax,
				total: totals.total,
				tax_lines: totals.tax_lines,
			},
		});
	}, [
		/**
		 * If we have currentOrder and totals as dependencies, the currentOrder will change first,
		 * update with the old totals, then the new totals will be calculated and updated.
		 *
		 * @TODO - this seems to work, but I worry about the order of operations,
		 * could currentOrder ever be stale?
		 */
		// currentOrder,
		// localPatch,
		totals,
	]);

	return totals;
};
