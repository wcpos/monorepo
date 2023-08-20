import * as React from 'react';

import find from 'lodash/find';
import uniq from 'lodash/uniq';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import {
	calculateDisplayValues,
	calculateLineItemTotals,
	calculateOrderTotalsAndTaxes,
	calculateTaxes,
	sumTaxes,
} from './utils';
import { useAppState } from '../../../../contexts/app-state';
import { useStoreStateManager } from '../../../../contexts/store-state-manager';

/**
 *
 */
const useTaxCalculation = (location: 'pos' | 'base') => {
	if (!location) {
		throw new Error('Location must be either "pos" or "base"');
	}
	const manager = useStoreStateManager();
	const query = manager.getQuery(['tax-rates', location]);
	const rates = useObservableSuspense(query.resource);
	const { store } = useAppState();

	const shippingTaxClass = useObservableState(store.shipping_tax_class$, store.shipping_tax_class);

	/**
	 * Convert WooCommerce settings into sensible primatives
	 */
	const _calcTaxes = useObservableState(store.calc_taxes$, store.calc_taxes);
	const _pricesIncludeTax = useObservableState(store.prices_include_tax$, store.prices_include_tax);
	const _taxRoundAtSubtotal = useObservableState(
		store.tax_round_at_subtotal$,
		store.tax_round_at_subtotal
	);
	const calcTaxes = _calcTaxes === 'yes';
	const pricesIncludeTax = _pricesIncludeTax === 'yes';
	const taxRoundAtSubtotal = _taxRoundAtSubtotal === 'yes';

	/**
	 *
	 */
	const calculateTaxesFromPrice = React.useCallback(
		({
			price = 0,
			taxClass = '',
			taxStatus = 'taxable',
			pricesIncludeTax = _pricesIncludeTax === 'yes',
		}) => {
			const _taxClass = taxClass === '' ? 'standard' : taxClass; // default to standard
			const appliedRates = rates.filter((rate) => rate.class === _taxClass);

			// early return if no taxes
			if (!calcTaxes || taxStatus === 'none' || appliedRates.length === 0) {
				return {
					total: 0,
					taxes: [],
				};
			}

			const taxes = calculateTaxes(price, appliedRates, pricesIncludeTax);
			return {
				total: sumTaxes(taxes),
				taxes,
			};
		},
		[_pricesIncludeTax, calcTaxes, rates]
	);

	/**
	 * Calculate line item taxes
	 */
	const calculateLineItemTaxes = React.useCallback(
		({
			total,
			subtotal,
			taxClass,
			taxStatus,
		}: {
			total: string;
			subtotal?: string;
			taxClass?: string;
			taxStatus?: string;
		}) => {
			const noSubtotal = subtotal === undefined;
			let subtotalTaxes = { total: 0, taxes: [] };

			if (!noSubtotal) {
				subtotalTaxes = calculateTaxesFromPrice({
					price: parseFloat(subtotal),
					taxClass,
					taxStatus,
					pricesIncludeTax: false,
				});
			}

			const totalTaxes = calculateTaxesFromPrice({
				price: parseFloat(total),
				taxClass,
				taxStatus,
				pricesIncludeTax: false,
			});

			const uniqueTaxIds = uniq([
				...subtotalTaxes.taxes.map((tax) => tax.id),
				...totalTaxes.taxes.map((tax) => tax.id),
			]);

			const taxes = uniqueTaxIds.map((id) => {
				const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
				const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };
				return {
					id,
					subtotal: noSubtotal ? '' : String(subtotalTax.total),
					total: String(totalTax.total),
				};
			});

			const result = {
				total_tax: String(totalTaxes.total),
				taxes,
			};

			if (!noSubtotal) {
				result.subtotal_tax = String(subtotalTaxes.total);
			}

			return result;
		},
		[calculateTaxesFromPrice]
	);

	/**
	 * TODO - I need to test this against WC unit tests to make sure it's correct
	 * see the WC_Tax::get_shipping_tax_rates() method for more details
	 *
	 * Here we are using any tax rate that has the shipping flag set to true
	 * unless the shipping tax class is set, in which case we use that.
	 * If no tax rates are found, we use the standard tax class.
	 */
	const calculateShippingLineTaxes = React.useCallback(
		({ total }) => {
			let appliedRates = rates.filter((rate) => rate.shipping === true);
			if (shippingTaxClass) {
				appliedRates = rates.filter((rate) => rate.class === shippingTaxClass);
			}

			if (appliedRates.length === 0) {
				appliedRates = rates.filter((rate) => rate.class === 'standard');
			}

			// early return if no taxes
			if (!calcTaxes || appliedRates.length === 0) {
				return {
					total,
					total_tax: '0',
					taxes: [],
				};
			}

			const shippingLineTotals = calculateLineItemTotals({
				quantity: 1,
				price: total,
				total,
				rates: appliedRates,
				pricesIncludeTax: false, // shipping is always exclusive
				taxRoundAtSubtotal,
			});

			// shipping (like fee) has subtotal set to '' in the WC REST API
			const updatedTaxes = shippingLineTotals.taxes.map((tax) => ({
				...tax,
				subtotal: '',
			}));

			return {
				total: shippingLineTotals.total,
				total_tax: shippingLineTotals.total_tax,
				taxes: updatedTaxes,
			};
		},
		[calcTaxes, rates, shippingTaxClass, taxRoundAtSubtotal]
	);

	/**
	 * Calculate order totals
	 * */
	const calculateOrderTotals = React.useCallback(
		({ lineItems, feeLines, shippingLines }) => {
			return calculateOrderTotalsAndTaxes({
				lineItems,
				feeLines,
				shippingLines,
				taxRates: rates, // NOTE: rates are only used to extract label and compound, not for calculation
				taxRoundAtSubtotal,
			});
		},
		[taxRoundAtSubtotal, rates]
	);

	/**
	 * Get the display values for a price with or without taxes
	 */
	const getDisplayValues = React.useCallback(
		(price: string = '0', taxClass: string, taxDisplayShop: 'incl' | 'excl') => {
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

	return {
		getDisplayValues,
		calculateOrderTotals,
		calculateShippingLineTaxes,
		calculateTaxesFromPrice,
		calculateLineItemTaxes,
	};
};

export default useTaxCalculation;
