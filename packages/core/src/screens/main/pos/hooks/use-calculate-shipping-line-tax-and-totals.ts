import * as React from 'react';

import { useShippingLineData } from './use-shipping-line-data';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';
import { getRoundingPrecision, roundHalfUp, roundTaxTotal } from '../../hooks/utils/precision';

type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];

/**
 * Take a shipping line object and calculate the tax and totals.
 * Returns the updated shipping line object.
 */
export const useCalculateShippingLineTaxAndTotals = () => {
	const { pricesIncludeTax, taxRoundAtSubtotal, priceNumDecimals } = useTaxRates();
	const { calculateTaxesFromValue } = useCalculateTaxesFromValue();
	const { getShippingLineData } = useShippingLineData();

	/**
	 *
	 */
	const calculateShippingLineTaxesAndTotals = React.useCallback(
		(shippingLine: Partial<ShippingLine>) => {
			const { amount, prices_include_tax, tax_status, tax_class } =
				getShippingLineData(shippingLine);
			const dp = priceNumDecimals;
			const roundingPrecision = getRoundingPrecision(dp);

			const tax = calculateTaxesFromValue({
				amount,
				taxClass: tax_class,
				taxStatus: tax_status,
				amountIncludesTax: prices_include_tax,
				shipping: true,
			});

			const total = prices_include_tax ? amount - tax.total : amount;

			// When roundAtSubtotal=false, round tax to dp per-item
			// When roundAtSubtotal=true, leave at rounding precision
			const roundedTotalTax = taxRoundAtSubtotal
				? tax.total
				: roundTaxTotal(tax.total, dp, pricesIncludeTax);

			return {
				...shippingLine,
				total: String(roundHalfUp(total, roundingPrecision)),
				total_tax: String(roundedTotalTax),
				taxes: tax.taxes.map((t) => ({
					...t,
					total: String(
						taxRoundAtSubtotal ? t.total : roundTaxTotal(t.total, dp, pricesIncludeTax)
					),
				})),
			};
		},
		[
			calculateTaxesFromValue,
			getShippingLineData,
			priceNumDecimals,
			pricesIncludeTax,
			taxRoundAtSubtotal,
		]
	);

	return { calculateShippingLineTaxesAndTotals };
};
