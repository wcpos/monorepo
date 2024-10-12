import * as React from 'react';

import find from 'lodash/find';
import round from 'lodash/round';
import uniq from 'lodash/uniq';

import { useLineItemData } from './use-line-item-data';
import { useTaxRates } from '../../contexts/tax-rates';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
type Tax = { id: number; total: number };
type TaxStatus = 'taxable' | 'none';

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
			subtotal: noSubtotal ? '' : String(subtotalTax.total),
			total: String(totalTax.total),
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
	 * Calculate the taxes for a line item, based on total and subtotal.
	 */
	const calculateLineItemTaxes = React.useCallback(
		({
			total,
			subtotal,
			taxClass,
			taxStatus,
		}: {
			total: number;
			subtotal?: number;
			taxClass: string;
			taxStatus: TaxStatus;
		}) => {
			const noSubtotal = subtotal === undefined;

			const subtotalTaxes = noSubtotal
				? { total: 0, taxes: [] as Tax[] }
				: calculateTaxesFromValue({
						amount: subtotal,
						taxClass,
						taxStatus,
						amountIncludesTax: false,
					});

			const totalTaxes = calculateTaxesFromValue({
				amount: total,
				taxClass,
				taxStatus,
				amountIncludesTax: false,
			});

			const taxes = consolidateTaxes(subtotalTaxes, totalTaxes, noSubtotal);

			return {
				total_tax: String(totalTaxes.total),
				taxes,
				subtotal_tax: noSubtotal ? undefined : String(subtotalTaxes.total),
			};
		},
		[calculateTaxesFromValue]
	);

	/**
	 * Calculate the tax and totals for a line item.
	 */
	const calculateLineItemTaxesAndTotals = React.useCallback(
		(lineItem: Partial<LineItem>) => {
			const { price, regular_price, tax_status } = getLineItemData(lineItem);

			// Calculate tax for price and regular price
			const tax = calculateTaxesFromValue({
				amount: price,
				taxClass: lineItem.tax_class ?? '',
				taxStatus: tax_status,
			});

			const regularTax = calculateTaxesFromValue({
				amount: regular_price,
				taxClass: lineItem.tax_class ?? '',
				taxStatus: tax_status,
			});

			// Adjust price and regular price if prices include tax
			const priceWithoutTax = pricesIncludeTax ? price - tax.total : price;
			const regularPriceWithoutTax = pricesIncludeTax
				? regular_price - regularTax.total
				: regular_price;

			const quantity = lineItem.quantity ?? 0;

			// Calculate total and subtotal based on quantity
			const total = round(priceWithoutTax * quantity, 6);
			const subtotal = round(regularPriceWithoutTax * quantity, 6);

			// Calculate taxes for the line item
			const totalTaxes = calculateLineItemTaxes({
				total,
				subtotal,
				taxClass: lineItem.tax_class ?? '',
				taxStatus: tax_status,
			});

			return {
				...lineItem,
				price: priceWithoutTax, // WC REST API always uses price without tax
				total: String(total),
				subtotal: String(subtotal),
				...totalTaxes,
			};
		},
		[calculateLineItemTaxes, calculateTaxesFromValue, getLineItemData, pricesIncludeTax]
	);

	return { calculateLineItemTaxesAndTotals };
};
