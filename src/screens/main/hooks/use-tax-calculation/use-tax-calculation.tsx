import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { calculateDisplayValues, calculateLineItemTotals, calculateOrderTotals } from './utils';
import useLocalData from '../../../../contexts/local-data';
import useTaxRates from '../../contexts/tax-rates';

import type { Cart } from './utils';

/**
 *
 */
const useTaxCalculation = () => {
	const { data: rates } = useTaxRates();
	const { store } = useLocalData();
	if (!store) {
		throw new Error('Store is not defined');
	}

	const shippingTaxClass = useObservableState(store.shipping_tax_class$, store.shipping_tax_class);

	/**
	 * Convert WooCommerce settings into sensible primatives
	 */
	const _calcTaxes = useObservableState(store?.calc_taxes$, store?.calc_taxes);
	const _pricesIncludeTax = useObservableState(store.prices_include_tax$, store.prices_include_tax);
	const _taxRoundAtSubtotal = useObservableState(
		store.tax_round_at_subtotal$,
		store.tax_round_at_subtotal
	);
	const calcTaxes = _calcTaxes === 'yes';
	const pricesIncludeTax = _pricesIncludeTax === 'yes';
	const taxRoundAtSubtotal = _taxRoundAtSubtotal === 'yes';

	/**
	 * Get the display values for a price with or without taxes
	 */
	const getDisplayValues = React.useCallback(
		(price: string | undefined, taxClass: string, taxDisplayShop: 'incl' | 'excl') => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates = rates.filter((rate) => rate.class === _taxClass);

			// early return if no taxes
			if (!calcTaxes || appliedRates.length === 0) {
				return {
					displayPrice: String(price),
					taxTotal: '0',
					taxDisplayShop,
				};
			}

			return calculateDisplayValues({
				price,
				taxDisplayShop,
				pricesIncludeTax,
				rates: appliedRates,
				taxRoundAtSubtotal,
			});
		},
		[calcTaxes, pricesIncludeTax, rates, taxRoundAtSubtotal]
	);

	/**
	 * Calculate line item totals, line items and fee lines, shipping lines are different
	 */
	const calcLineItemTotals = React.useCallback(
		(qty = 1, price = '0', taxClass = '', taxStatus: string) => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates = rates.filter((rate) => rate.class === _taxClass);

			// early return if no taxes
			if (!calcTaxes || taxStatus === 'none' || appliedRates.length === 0) {
				const subtotal = String(qty * parseFloat(price));
				return {
					subtotal,
					subtotal_tax: '0',
					total: subtotal,
					total_tax: '0',
					taxes: [],
				};
			}

			return calculateLineItemTotals({
				qty,
				price,
				rates: appliedRates,
				pricesIncludeTax,
				taxRoundAtSubtotal,
			});
		},
		[calcTaxes, pricesIncludeTax, rates, taxRoundAtSubtotal]
	);

	/**
	 * TODO - I need to test this against WC unit tests to make sure it's correct
	 * see the WC_Tax::get_shipping_tax_rates() method for more details
	 *
	 * Here we are using any tax rate that has the shipping flag set to true
	 * unless the shipping tax class is set, in which case we use that.
	 * If no tax rates are found, we use the standard tax class.
	 */
	const calcShippingLineTotals = React.useCallback(
		(total = '0') => {
			let appliedRates = rates.filter((rate) => rate.shipping === true);
			if (shippingTaxClass) {
				appliedRates = rates.filter((rate) => rate.class === shippingTaxClass);
			}

			if (appliedRates.length === 0) {
				appliedRates = rates.filter((rate) => rate.class === 'standard');
			}

			// early return if no taxes
			if (!calcTaxes || appliedRates.length === 0) {
				const subtotal = total;
				return {
					subtotal,
					subtotal_tax: '0',
					total: subtotal,
					total_tax: '0',
					taxes: [],
				};
			}

			return calculateLineItemTotals({
				qty: 1,
				price: total,
				rates: appliedRates,
				pricesIncludeTax: false, // shipping is always exclusive
				taxRoundAtSubtotal,
			});
		},
		[calcTaxes, rates, shippingTaxClass, taxRoundAtSubtotal]
	);

	/**
	 * Calculate order totals
	 * */
	const calcOrderTotals = React.useCallback(
		(lines: Cart) => {
			return calculateOrderTotals({
				lines,
				taxRoundAtSubtotal,
				rates, // NOTE: rates are onnly used to extract label and compound, not for calculation
			});
		},
		[taxRoundAtSubtotal, rates]
	);

	return {
		getDisplayValues,
		calcLineItemTotals,
		calcOrderTotals,
		calcShippingLineTotals,
	};
};

export default useTaxCalculation;
