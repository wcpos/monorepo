import * as React from 'react';

import { priceToNumber } from './utils';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';
import { useShippingLineData } from '../cart/cells/use-shipping-line-data';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];

/**
 * Take a fee line object and calculate the tax and totals.
 * Returns the updated fee line object.
 */
export const useCalculateShippingLineTaxAndTotals = () => {
	const { calculateTaxesFromValue } = useTaxCalculator();
	const { getShippingLineData } = useShippingLineData();

	/**
	 *
	 */
	const calculateShippingLineTaxesAndTotals = React.useCallback(
		(shippingLine: Partial<ShippingLine>) => {
			const { amount, prices_include_tax, tax_status, tax_class } =
				getShippingLineData(shippingLine);

			const tax = calculateTaxesFromValue({
				value: amount,
				taxClass: tax_class,
				taxStatus: tax_status,
				valueIncludesTax: prices_include_tax,
				shipping: true,
			});

			const total = prices_include_tax ? priceToNumber(amount) - tax.total : tax.total;

			return {
				...shippingLine,
				total: String(total),
				total_tax: String(tax.total),
				taxes: tax.taxes,
			};
		},
		[calculateTaxesFromValue, getShippingLineData]
	);

	return { calculateShippingLineTaxesAndTotals };
};
