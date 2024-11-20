import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { useTaxInclOrExcl } from './use-tax-incl-or-excl';
import { calculateTaxes } from './utils/calculate-taxes';
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
		let displayValue = amount;

		// early return if no taxes
		if (!calcTaxes || taxStatus === 'none' || appliedRates.length === 0) {
			return {
				displayValue: amount,
				taxTotal: 0,
				inclOrExcl,
			};
		}

		const { total: taxTotal } = calculateTaxes({ amount, rates: appliedRates, amountIncludesTax });

		if (amountIncludesTax && inclOrExcl === 'excl') {
			displayValue = amount - taxTotal;
		}

		if (!amountIncludesTax && inclOrExcl === 'incl') {
			displayValue = amount + taxTotal;
		}

		return {
			displayValue,
			taxTotal,
			inclOrExcl,
		};
	}, [amount, calcTaxes, taxStatus, appliedRates, amountIncludesTax, inclOrExcl]);
};
