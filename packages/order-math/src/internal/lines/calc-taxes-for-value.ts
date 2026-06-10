import isEmpty from 'lodash/isEmpty';

import { calculateTaxes } from '../money/calculate-taxes';

import type { CartConfig } from '../../config';

/**
 * Pure port of `useCalculateTaxesFromValue` (packages/core/src/screens/main/hooks/
 * use-calculate-taxes-from-value.ts).
 *
 * Substitutions vs the hook:
 * - context reads (`rates`, `calcTaxes`, `priceNumDecimals`) -> `config` fields
 * - the hook's `amountIncludesTax ?? pricesIncludeTax` fallback is dropped: every
 *   caller passes `amountIncludesTax` explicitly (each compute body decides per
 *   its own rounding quirk).
 *
 * Rate-filter and early-return order match the hook exactly: class filter, then
 * shipping filter, then the calcTaxes / tax_status / no-rates gate.
 */
export function calculateTaxesForValue(
	args: {
		amount: number;
		taxStatus: string;
		taxClass?: string | null;
		amountIncludesTax: boolean;
		shipping?: boolean;
	},
	config: CartConfig
): { total: number; taxes: { id: number; total: number }[] } {
	const taxClass = isEmpty(args.taxClass) ? 'standard' : (args.taxClass as string);
	let appliedRates = config.rates.filter((rate) => rate.class === taxClass);

	// if shipping, we need to filter by shipping flag
	if (args.shipping) {
		appliedRates = appliedRates.filter((rate) => rate.shipping === true);
	}

	// early return if no taxes
	if (!config.calcTaxes || args.taxStatus === 'none' || appliedRates.length === 0) {
		return {
			total: 0,
			taxes: [],
		};
	}

	return calculateTaxes({
		amount: args.amount,
		rates: appliedRates as { id: number; rate: string; compound: boolean; order: number }[],
		amountIncludesTax: args.amountIncludesTax,
		dp: config.dp,
	});
}
