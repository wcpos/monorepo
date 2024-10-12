import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { useTaxInclOrExcl } from './use-tax-incl-or-excl';
import { calculateDisplayValues } from './utils/calculate-display-values';
import { useTaxRates } from '../contexts/tax-rates';

interface TaxDisplayValuesProps {
	amount: number;
	taxClass: string;
	taxStatus: 'taxable' | 'none' | 'shipping';
	context: 'shop' | 'cart';
	amountIncludesTax?: boolean;
}

/**
 * Calculate the display values with or without taxes (eg: price or total)
 *
 * @TODO - I should take and return numbers instead of strings
 */
export const useTaxDisplayValues = ({
	amount,
	taxStatus,
	context,
	...props
}: TaxDisplayValuesProps) => {
	const { rates, calcTaxes, pricesIncludeTax } = useTaxRates();
	const { inclOrExcl } = useTaxInclOrExcl({ context });
	const amountIncludesTax = props.amountIncludesTax ?? pricesIncludeTax;

	/**
	 *
	 */
	const appliedRates = React.useMemo(() => {
		const taxClass = isEmpty(props.taxClass) ? 'standard' : props.taxClass;
		return rates.filter((rate) => rate.class === taxClass);
	}, [props.taxClass, rates]);

	/**
	 *
	 */
	return React.useMemo(() => {
		// early return if no taxes
		if (!calcTaxes || taxStatus === 'none' || appliedRates.length === 0) {
			return {
				displayValue: amount,
				taxTotal: 0,
				inclOrExcl,
			};
		}

		return calculateDisplayValues({
			amount,
			inclOrExcl,
			amountIncludesTax,
			rates: appliedRates,
		});
	}, [calcTaxes, taxStatus, appliedRates, amount, inclOrExcl, amountIncludesTax]);
};
