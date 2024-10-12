import round from 'lodash/round';

import { calculateTaxes } from './calculate-taxes';
import { sumItemizedTaxes, sumTaxes } from './sum-taxes';

/**
 * Calculate the display values for an amount with or without taxes
 * - tax will be calculated based on the rates and pricesIncludeTax
 * - itemized taxes will be sumed
 * - the displayValue will be the amount with or without taxes based on inclOrExcl
 */
export function calculateDisplayValues({
	amount,
	rates,
	amountIncludesTax,
	inclOrExcl,
}: {
	amount: number;
	rates: { id: number; rate: string; compound: boolean; order: number; [key: string]: any }[];
	amountIncludesTax: boolean;
	inclOrExcl: 'incl' | 'excl';
}) {
	const taxes = calculateTaxes({ amount, rates, amountIncludesTax });
	const itemizedTaxTotals = sumItemizedTaxes({ taxes });
	const taxTotal = sumTaxes({ taxes: itemizedTaxTotals });
	let displayValue = amount;

	if (amountIncludesTax && inclOrExcl === 'excl') {
		displayValue = round(amount - taxTotal, 6);
	}

	if (!amountIncludesTax && inclOrExcl === 'incl') {
		displayValue = round(amount + taxTotal, 6);
	}

	return {
		displayValue,
		taxTotal,
		inclOrExcl,
	};
}
