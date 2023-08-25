import * as React from 'react';

import { useObservableState, useObservableEagerState } from 'observable-hooks';
import { BehaviorSubject } from 'rxjs';

import { useAppState } from '../../../../contexts/app-state';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export const useCartTotals = (
	extraTotals$: BehaviorSubject<{
		subtotal: string;
		subtotal_tax: string;
		fee_total: string;
		fee_tax: string;
	}>
) => {
	const { currentOrder } = useCurrentOrder();
	const { store } = useAppState();
	const taxTotalDisplay = useObservableState(store.tax_total_display$, store.tax_total_display);
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const customerNote = useObservableState(currentOrder.customer_note$, currentOrder.customer_note);
	const { subtotal, subtotal_tax, fee_total, fee_tax } = useObservableEagerState(extraTotals$);

	/**
	 * Subscribe to properties that are available on the order
	 * TODO - is it better to do a combineLatest here?
	 */
	const discount_tax = useObservableState(currentOrder.discount_tax$, currentOrder.discount_tax);
	const discount_total = useObservableState(
		currentOrder.discount_total$,
		currentOrder.discount_total
	);
	const shipping_tax = useObservableState(currentOrder.shipping_tax$, currentOrder.shipping_tax);
	const shipping_total = useObservableState(
		currentOrder.shipping_total$,
		currentOrder.shipping_total
	);
	const tax_lines = useObservableState(currentOrder.tax_lines$, currentOrder.tax_lines);
	const total_tax = useObservableState(currentOrder.total_tax$, currentOrder.total_tax);
	// const total = useObservableState(currentOrder.total$, currentOrder.total);

	/**
	 * Helpers
	 */
	const hasSubtotal = parseFloat(subtotal) !== 0;
	const hasDiscount = parseFloat(discount_total) !== 0;
	const hasShipping = parseFloat(shipping_total) !== 0;
	const hasFee = parseFloat(fee_total) !== 0;
	const hasTax = parseFloat(total_tax) !== 0;
	const hasTotals = hasSubtotal || hasDiscount || hasShipping || hasFee || hasTax;

	/**
	 *
	 */
	const displaySubtotal =
		taxDisplayCart === 'incl' ? parseFloat(subtotal) + parseFloat(subtotal_tax) : subtotal;
	const displayDiscountTotal =
		taxDisplayCart === 'incl'
			? parseFloat(discount_total) + parseFloat(discount_tax)
			: discount_total;
	const displayFeeTotal =
		taxDisplayCart === 'incl' ? parseFloat(fee_total) + parseFloat(fee_tax) : fee_total;
	const displayShippingTotal =
		taxDisplayCart === 'incl'
			? parseFloat(shipping_total) + parseFloat(shipping_tax)
			: shipping_total;

	/**
	 *
	 */
	return {
		discount_tax,
		discount_total,
		shipping_tax,
		shipping_total,
		tax_lines,
		total_tax,
		// total,
		fee_tax,
		fee_total,
		subtotal_tax,
		subtotal,

		hasSubtotal,
		hasDiscount,
		hasShipping,
		hasFee,
		hasTax,
		hasTotals,

		displaySubtotal,
		displayDiscountTotal,
		displayFeeTotal,
		displayShippingTotal,

		taxTotalDisplay,
		taxDisplayCart,
		calcTaxes: calcTaxes === 'yes',

		customerNote,
	};
};
