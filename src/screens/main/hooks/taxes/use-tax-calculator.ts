import * as React from 'react';

import find from 'lodash/find';
import isEmpty from 'lodash/isEmpty';
import uniq from 'lodash/uniq';

import { calculateTaxes, sumTaxes, calculateLineItemTotals } from './utils';
import { useTaxRates } from '../../contexts/tax-rates';

interface TaxCalculatorProps {
	/**
	 * Value, eg: price or total as a number or string
	 */
	value: number | string;
	taxClass: string;
	taxStatus: 'taxable' | 'none' | 'shipping'; // what to do with shipping?
	/**
	 * Allow override of default store settings, ie; for cart calculations
	 */
	valueIncludesTax?: boolean;
	/**
	 * Shipping flag
	 */
	shipping?: boolean;
}

export interface CalculateLineItemTaxesProps {
	total: string;
	subtotal?: string;
	taxClass?: string;
	taxStatus?: 'taxable' | 'none' | 'shipping';
}

/**
 * Calculate the tax for a given value
 */
export const useTaxCalculator = () => {
	const { rates, calcTaxes, pricesIncludeTax, taxRoundAtSubtotal, shippingTaxClass } =
		useTaxRates();

	/**
	 * Returns a function that calculates the tax for a given value
	 */
	const calculateTaxesFromValue = React.useCallback(
		({ value = 0, taxStatus = 'taxable', shipping = false, ...props }: TaxCalculatorProps) => {
			const taxClass = isEmpty(props.taxClass) ? 'standard' : props.taxClass;
			const valueIncludesTax = props.valueIncludesTax ?? pricesIncludeTax;
			const valueAsNumber = typeof value === 'string' ? parseFloat(value) : value;
			let appliedRates = rates.filter((rate) => rate.class === taxClass);

			// if shipping, we need to filter by shipping flag
			if (shipping) {
				appliedRates = appliedRates.filter((rate) => rate.shipping === true);
			}

			// early return if no taxes
			if (!calcTaxes || taxStatus === 'none' || appliedRates.length === 0) {
				return {
					total: 0,
					taxes: [],
				};
			}

			const taxes = calculateTaxes(valueAsNumber, appliedRates, valueIncludesTax);
			return {
				total: sumTaxes(taxes),
				taxes,
			};
		},
		[calcTaxes, pricesIncludeTax, rates]
	);

	/**
	 * NOTE: We are using this for line items and fee lines
	 */
	const calculateLineItemTaxes = React.useCallback(
		({ total, subtotal, taxClass, taxStatus }: CalculateLineItemTaxesProps) => {
			const noSubtotal = subtotal === undefined;
			let subtotalTaxes = { total: 0, taxes: [] as { id: number; total: string }[] };

			// @TODO - if taxes not active, or taxStatus is none, we should return early?

			if (!noSubtotal) {
				subtotalTaxes = calculateTaxesFromValue({
					value: subtotal,
					taxClass,
					taxStatus,
					valueIncludesTax: false,
				});
			}

			const totalTaxes = calculateTaxesFromValue({
				value: total,
				taxClass,
				taxStatus,
				valueIncludesTax: false,
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

			const result: {
				total_tax: string;
				subtotal_tax?: string;
				taxes: { id: number; subtotal: string; total: string }[];
			} = {
				total_tax: String(totalTaxes.total),
				taxes,
			};

			if (!noSubtotal) {
				result.subtotal_tax = String(subtotalTaxes.total);
			}

			return result;
		},
		[calculateTaxesFromValue]
	);

	/**
	 * TODO - I need to test this against WC unit tests to make sure it's correct
	 * see the WC_Tax::get_shipping_tax_rates() method for more details
	 *
	 * - tax rate should have the shipping flag set to true
	 * - shipping tax class is set on the store settings
	 */
	const calculateShippingLineTaxes = React.useCallback(
		({ total }) => {
			let appliedRates = rates.filter((rate) => rate.shipping === true);

			if (!shippingTaxClass || shippingTaxClass === 'inherit') {
				appliedRates = rates.filter((rate) => rate.class === 'standard');
			} else {
				appliedRates = rates.filter((rate) => rate.class === shippingTaxClass);
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

			const result = {
				total: shippingLineTotals.total,
				total_tax: shippingLineTotals.total_tax,
				taxes: updatedTaxes,
			};

			return result;
		},
		[calcTaxes, rates, shippingTaxClass, taxRoundAtSubtotal]
	);

	/**
	 *
	 */
	return { calculateTaxesFromValue, calculateLineItemTaxes, calculateShippingLineTaxes };
};
