import * as React from 'react';

import find from 'lodash/find';
import round from 'lodash/round';
import uniq from 'lodash/uniq';

import { useLineItemData } from './use-line-item-data';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type Tax = { id: number; total: number };

/**
 * Consolidates unique taxes by combining subtotal and total tax values.
 */
const consolidateTaxes = (
	subtotalTaxes: { taxes: Tax[] },
	totalTaxes: { taxes: Tax[] },
	noSubtotal: boolean
) => {
	const uniqueTaxIds = uniq([
		...subtotalTaxes.taxes.map((tax) => tax.id),
		...totalTaxes.taxes.map((tax) => tax.id),
	]);

	return uniqueTaxIds.map((id) => {
		const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
		const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };

		return {
			id,
			subtotal: noSubtotal ? '' : String(round(subtotalTax.total, 6)),
			total: String(round(totalTax.total, 6)),
		};
	});
};

/**
 * Custom hook to calculate line item tax and totals.
 */
export const useCalculateLineItemTaxAndTotals = () => {
	const { pricesIncludeTax } = useTaxRates();
	const { calculateTaxesFromValue } = useCalculateTaxesFromValue();
	const { getLineItemData } = useLineItemData();

	/**
	 * Calculate the tax and totals for a line item.
	 */
	const calculateLineItemTaxesAndTotals = React.useCallback(
		(lineItem: Partial<LineItem>) => {
			const { price, regular_price, tax_status } = getLineItemData(lineItem);
			const quantity = lineItem.quantity ?? 0;

			// Calculate total and subtotal based on quantity
			const total = price * quantity;
			const subtotal = regular_price * quantity;

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

			// Calculate total and subtotal excluding tax
			const totalExclTax = pricesIncludeTax ? total - totalTaxResult.total : total;
			const subtotalExclTax = pricesIncludeTax ? subtotal - subtotalTaxResult.total : subtotal;

			// Calculate price per unit excluding tax
			const priceWithoutTax = pricesIncludeTax ? price - perUnitTaxResult.total : price;

			// Consolidate taxes
			const taxes = consolidateTaxes(subtotalTaxResult, totalTaxResult, false);

			return {
				...lineItem,
				price: round(priceWithoutTax, 6), // WC REST API always uses price without tax
				total: String(round(totalExclTax, 6)),
				subtotal: String(round(subtotalExclTax, 6)),
				total_tax: String(round(totalTaxResult.total, 6)),
				subtotal_tax: String(round(subtotalTaxResult.total, 6)),
				taxes,
			};
		},
		[calculateTaxesFromValue, getLineItemData, pricesIncludeTax]
	);

	return { calculateLineItemTaxesAndTotals };
};
