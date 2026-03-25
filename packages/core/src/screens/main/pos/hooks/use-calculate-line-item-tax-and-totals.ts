import * as React from 'react';

import find from 'lodash/find';
import uniq from 'lodash/uniq';

import { useLineItemData } from './use-line-item-data';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';
import { getRoundingPrecision, roundHalfUp, roundTaxTotal } from '../../hooks/utils/precision';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type Tax = { id: number; total: number };

/**
 * Consolidates unique taxes by combining subtotal and total tax values.
 *
 * When roundAtSubtotal=false, each per-rate tax is rounded to dp before output.
 * When roundAtSubtotal=true, taxes are left at full precision (deferred to order totals).
 */
const consolidateTaxes = (
	subtotalTaxes: { taxes: Tax[] },
	totalTaxes: { taxes: Tax[] },
	noSubtotal: boolean,
	dp: number,
	pricesIncludeTax: boolean,
	roundAtSubtotal: boolean
) => {
	const uniqueTaxIds = uniq([
		...subtotalTaxes.taxes.map((tax) => tax.id),
		...totalTaxes.taxes.map((tax) => tax.id),
	]);

	return uniqueTaxIds.map((id) => {
		const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
		const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };

		// When roundAtSubtotal=false, round each per-rate tax to dp (matches WC per-item rounding)
		// When roundAtSubtotal=true, leave at rounding precision (deferred to order totals)
		const roundedSubtotalTax = roundAtSubtotal
			? subtotalTax.total
			: roundTaxTotal(subtotalTax.total, dp, pricesIncludeTax);
		const roundedTotalTax = roundAtSubtotal
			? totalTax.total
			: roundTaxTotal(totalTax.total, dp, pricesIncludeTax);

		return {
			id,
			subtotal: noSubtotal ? '' : String(roundedSubtotalTax),
			total: String(roundedTotalTax),
		};
	});
};

/**
 * Custom hook to calculate line item tax and totals.
 */
export const useCalculateLineItemTaxAndTotals = () => {
	const { pricesIncludeTax, taxRoundAtSubtotal, priceNumDecimals } = useTaxRates();
	const { calculateTaxesFromValue } = useCalculateTaxesFromValue();
	const { getLineItemData } = useLineItemData();

	/**
	 * Calculate the tax and totals for a line item.
	 */
	const calculateLineItemTaxesAndTotals = React.useCallback(
		(lineItem: Partial<LineItem>) => {
			const { price, tax_status } = getLineItemData(lineItem);
			const quantity = lineItem.quantity ?? 0;
			const dp = priceNumDecimals;
			const roundingPrecision = getRoundingPrecision(dp);

			// Calculate total and subtotal based on quantity
			const total = price * quantity;
			const subtotal = price * quantity;

			// Calculate taxes for total and subtotal
			const totalTaxResult = calculateTaxesFromValue({
				amount: total,
				taxClass: lineItem.tax_class ?? '',
				taxStatus: tax_status,
				amountIncludesTax: pricesIncludeTax,
			});

			const subtotalTaxResult = calculateTaxesFromValue({
				amount: subtotal,
				taxClass: lineItem.tax_class ?? '',
				taxStatus: tax_status,
				amountIncludesTax: pricesIncludeTax,
			});

			const perUnitTaxResult = calculateTaxesFromValue({
				amount: price,
				taxClass: lineItem.tax_class ?? '',
				taxStatus: tax_status,
				amountIncludesTax: pricesIncludeTax,
			});

			// When roundAtSubtotal=false, round total_tax to dp (per-item rounding)
			// When roundAtSubtotal=true, leave at rounding precision
			const roundedTotalTax = taxRoundAtSubtotal
				? totalTaxResult.total
				: roundTaxTotal(totalTaxResult.total, dp, pricesIncludeTax);
			const roundedSubtotalTax = taxRoundAtSubtotal
				? subtotalTaxResult.total
				: roundTaxTotal(subtotalTaxResult.total, dp, pricesIncludeTax);

			// Calculate total and subtotal excluding tax
			const totalExclTax = pricesIncludeTax ? total - totalTaxResult.total : total;
			const subtotalExclTax = pricesIncludeTax ? subtotal - subtotalTaxResult.total : subtotal;

			// Calculate price per unit excluding tax
			const priceWithoutTax = pricesIncludeTax ? price - perUnitTaxResult.total : price;

			// Consolidate taxes
			const taxes = consolidateTaxes(
				subtotalTaxResult,
				totalTaxResult,
				false,
				dp,
				pricesIncludeTax,
				taxRoundAtSubtotal
			);

			// Line-level values (total, subtotal, price) are stored at rounding precision (6dp)
			// to match WC's internal storage. WC stores these "unrounded" via wc_format_decimal()
			// and the POS API returns them at dp=6. Only order-level totals get rounded to dp.
			return {
				...lineItem,
				price: roundHalfUp(priceWithoutTax, roundingPrecision),
				total: String(roundHalfUp(totalExclTax, roundingPrecision)),
				subtotal: String(roundHalfUp(subtotalExclTax, roundingPrecision)),
				total_tax: String(roundedTotalTax),
				subtotal_tax: String(roundedSubtotalTax),
				taxes,
			};
		},
		[
			calculateTaxesFromValue,
			getLineItemData,
			priceNumDecimals,
			pricesIncludeTax,
			taxRoundAtSubtotal,
		]
	);

	return { calculateLineItemTaxesAndTotals };
};
