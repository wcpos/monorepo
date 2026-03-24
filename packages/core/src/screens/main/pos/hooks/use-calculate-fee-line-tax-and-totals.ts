import * as React from 'react';

import { useFeeLineData } from './use-fee-line-data';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';
import { getRoundingPrecision, roundHalfUp, roundTaxTotal } from '../../hooks/utils/precision';
import { useCurrentOrder } from '../contexts/current-order';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

/**
 * Take a fee line object and calculate the tax and totals.
 * Returns the updated fee line object.
 */
export const useCalculateFeeLineTaxAndTotals = () => {
	const { pricesIncludeTax, taxRoundAtSubtotal, priceNumDecimals } = useTaxRates();
	const { calculateTaxesFromValue } = useCalculateTaxesFromValue();
	const { getFeeLineData } = useFeeLineData();
	const { currentOrder } = useCurrentOrder();

	/**
	 * If fee is a fixed percent of the order total, calculate the amount.
	 */
	const calculatePercentAmount = React.useCallback(
		({
			amount,
			percent_of_cart_total_with_tax,
		}: {
			amount: number;
			percent_of_cart_total_with_tax: boolean;
		}) => {
			const order = currentOrder.getLatest();
			const percentAmount = amount / 100;

			// Sum the total and total_tax of all line items
			const { cart_total, cart_total_tax } = (order.line_items || []).reduce(
				(acc, item) => {
					if (item.product_id !== null) {
						acc.cart_total += parseFloat(item.total ?? '0');
						acc.cart_total_tax += parseFloat(item.total_tax ?? '0');
					}
					return acc;
				},
				{ cart_total: 0, cart_total_tax: 0 }
			);

			const total = percent_of_cart_total_with_tax ? cart_total + cart_total_tax : cart_total;

			return total * percentAmount;
		},
		[currentOrder]
	);

	/**
	 *
	 */
	const calculateFeeLineTaxesAndTotals = React.useCallback(
		(feeLine: Partial<FeeLine>) => {
			const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax } =
				getFeeLineData(feeLine);
			const dp = priceNumDecimals;
			const roundingPrecision = getRoundingPrecision(dp);
			let value = amount;

			if (percent) {
				value = calculatePercentAmount({ amount: value, percent_of_cart_total_with_tax });
			}

			const tax = calculateTaxesFromValue({
				amount: value,
				taxClass: feeLine.tax_class,
				taxStatus: feeLine.tax_status ?? 'taxable',
				amountIncludesTax: prices_include_tax,
			});

			const total = prices_include_tax ? value - tax.total : value;

			// When roundAtSubtotal=false, round tax to dp per-item
			// When roundAtSubtotal=true, leave at rounding precision
			const roundedTotalTax = taxRoundAtSubtotal
				? tax.total
				: roundTaxTotal(tax.total, dp, pricesIncludeTax);

			return {
				...feeLine,
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
			calculatePercentAmount,
			calculateTaxesFromValue,
			getFeeLineData,
			priceNumDecimals,
			pricesIncludeTax,
			taxRoundAtSubtotal,
		]
	);

	return { calculateFeeLineTaxesAndTotals };
};
