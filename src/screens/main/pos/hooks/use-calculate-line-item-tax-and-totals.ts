import * as React from 'react';

import round from 'lodash/round';

import { useLineItemData } from './use-line-item-data';
import { priceToNumber } from './utils';
import { useTaxRates } from '../../contexts/tax-rates';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

/**
 * Take a line item object and calculate the tax and totals.
 * Returns the updated line item object.
 */
export const useCalculateLineItemTaxAndTotals = () => {
	const { pricesIncludeTax } = useTaxRates();
	const { calculateTaxesFromValue, calculateLineItemTaxes } = useTaxCalculator();
	const { getLineItemData } = useLineItemData();

	/**
	 *
	 */
	const calculateLineItemTaxesAndTotals = React.useCallback(
		(lineItem: Partial<LineItem>) => {
			const { price, regular_price, tax_status } = getLineItemData(lineItem);

			let priceWithoutTax = priceToNumber(price);
			const tax = calculateTaxesFromValue({
				value: price,
				taxClass: lineItem.tax_class,
				taxStatus: tax_status,
			});

			let regularPriceWithoutTax = priceToNumber(regular_price);
			const regularTax = calculateTaxesFromValue({
				value: regular_price,
				taxClass: lineItem.tax_class,
				taxStatus: tax_status,
			});

			if (pricesIncludeTax) {
				priceWithoutTax = priceToNumber(price) - tax.total;
				regularPriceWithoutTax = priceToNumber(regular_price) - regularTax.total;
			}

			const total = String(round(priceWithoutTax * lineItem.quantity, 6));
			const subtotal = String(round(regularPriceWithoutTax * lineItem.quantity, 6));

			const totalTaxes = calculateLineItemTaxes({
				total,
				subtotal,
				taxStatus: tax_status,
				taxClass: lineItem.tax_class,
			});

			return {
				...lineItem,
				price: priceWithoutTax, // WC REST API always uses price without tax
				total,
				subtotal,
				...totalTaxes,
			};
		},
		[calculateLineItemTaxes, calculateTaxesFromValue, getLineItemData, pricesIncludeTax]
	);

	return { calculateLineItemTaxesAndTotals };
};
