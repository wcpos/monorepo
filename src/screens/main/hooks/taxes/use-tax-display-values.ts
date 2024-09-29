import * as React from 'react';

import isEmpty from 'lodash/isEmpty';

import { useTaxDisplay } from './use-tax-display';
import { calculateDisplayValues } from './utils';
import { useTaxRates } from '../../contexts/tax-rates';

interface TaxDisplayValuesProps {
	/**
	 * Value, eg: price or total as a string
	 */
	value: string;
	taxClass: string;
	taxStatus: 'taxable' | 'none' | 'shipping';
	context: 'shop' | 'cart';
	valueIncludesTax?: boolean;
}

/**
 * Calculate the display values with or without taxes (eg: price or total)
 *
 * @TODO - I should take and return numbers instead of strings
 */
export const useTaxDisplayValues = ({
	value,
	taxStatus,
	context,
	...props
}: TaxDisplayValuesProps) => {
	const taxClass = isEmpty(props.taxClass) ? 'standard' : props.taxClass;
	const { rates, calcTaxes, pricesIncludeTax, taxRoundAtSubtotal } = useTaxRates();
	const { inclOrExcl } = useTaxDisplay({ context });
	const valueIncludesTax = props.valueIncludesTax ?? pricesIncludeTax;

	/**
	 *
	 */
	const appliedRates = React.useMemo(() => {
		return rates.filter((rate) => rate.class === taxClass);
	}, [rates, taxClass]);

	/**
	 *
	 */
	return React.useMemo(() => {
		// early return if no taxes
		if (!calcTaxes || taxStatus === 'none' || appliedRates.length === 0) {
			return {
				displayValue: value,
				taxTotal: '0',
				inclOrExcl,
			};
		}

		return calculateDisplayValues({
			value,
			inclOrExcl,
			pricesIncludeTax: valueIncludesTax,
			rates: appliedRates,
			taxRoundAtSubtotal,
		});
	}, [appliedRates, calcTaxes, inclOrExcl, valueIncludesTax, taxRoundAtSubtotal, taxStatus, value]);
};
