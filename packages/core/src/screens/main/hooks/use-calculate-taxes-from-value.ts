import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { calculateTaxes } from './utils/calculate-taxes';
import { useTaxRates } from '../contexts/tax-rates';

/**
 *
 */
export const useCalculateTaxesFromValue = () => {
	const { rates, calcTaxes, pricesIncludeTax } = useTaxRates();

	/**
	 * Returns a function that calculates the tax for a given value
	 */
	const calculateTaxesFromValue = React.useCallback(
		({
			amount,
			taxStatus,
			shipping = false,
			...props
		}: {
			amount: number;
			taxStatus: 'taxable' | 'none';
			shipping?: boolean;
			taxClass?: string;
			amountIncludesTax?: boolean;
		}) => {
			const taxClass = isEmpty(props.taxClass) ? 'standard' : props.taxClass;
			const amountIncludesTax = props.amountIncludesTax ?? pricesIncludeTax;
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

			return calculateTaxes({
				amount,
				rates: appliedRates,
				amountIncludesTax,
			});
		},
		[calcTaxes, pricesIncludeTax, rates]
	);

	return {
		calculateTaxesFromValue,
	};
};
