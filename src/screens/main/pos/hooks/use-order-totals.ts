import * as React from 'react';

import { useObservable, useObservableState } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { map, switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import type { OrderDocument } from '@wcpos/database';

import { calculateOrderTotals } from './calculate-order-totals';
import { useTaxRates } from '../../contexts/tax-rates';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export const useOrderTotals = () => {
	const { currentOrder } = useCurrentOrder();
	const { rates, taxRoundAtSubtotal } = useTaxRates();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const totals$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				debounceTime(10), // debounce to prevent multiple calculations
				switchMap(([order, rates, taxRoundAtSubtotal]) => {
					return combineLatest([order.line_items$, order.fee_lines$, order.shipping_lines$]).pipe(
						debounceTime(10), // debounce to prevent multiple calculations
						map(([lineItems, feeLines, shippingLines]) => {
							const totals = calculateOrderTotals({
								lineItems,
								feeLines,
								shippingLines,
								taxRates: rates,
								taxRoundAtSubtotal,
							});

							return totals;
						}),
						distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
						switchMap(async (totals) => {
							await localPatch({
								document: order,
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

							return totals;
						})
					);
				})
			),
		[currentOrder, rates, taxRoundAtSubtotal]
	);

	const totals = useObservableState(totals$, {
		discount_total: currentOrder.discount_total || '',
		discount_tax: currentOrder.discount_tax || '',
		shipping_total: currentOrder.shipping_total || '',
		shipping_tax: currentOrder.shipping_tax || '',
		cart_tax: currentOrder.cart_tax || '',
		total: currentOrder.total || '',
		total_tax: currentOrder.total_tax || '',
		tax_lines: currentOrder.tax_lines || [],
		subtotal: '',
		subtotal_tax: '',
		fee_total: '',
		fee_tax: '',
	});

	return totals;
};
