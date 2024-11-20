import * as React from 'react';

import round from 'lodash/round';

import { useShippingLineData } from './use-shipping-line-data';
import { useCalculateTaxesFromValue } from '../../hooks/use-calculate-taxes-from-value';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];

/**
 * Take a fee line object and calculate the tax and totals.
 * Returns the updated fee line object.
 */
export const useCalculateShippingLineTaxAndTotals = () => {
	const { calculateTaxesFromValue } = useCalculateTaxesFromValue();
	const { getShippingLineData } = useShippingLineData();

	/**
	 *
	 */
	const calculateShippingLineTaxesAndTotals = React.useCallback(
		(shippingLine: Partial<ShippingLine>) => {
			const { amount, prices_include_tax, tax_status, tax_class } =
				getShippingLineData(shippingLine);

			const tax = calculateTaxesFromValue({
				amount,
				taxClass: tax_class,
				taxStatus: tax_status,
				amountIncludesTax: prices_include_tax,
				shipping: true,
			});

			const total = prices_include_tax ? amount - tax.total : amount;

			return {
				...shippingLine,
				total: String(round(total, 6)),
				total_tax: String(round(tax.total, 6)),
				taxes: tax.taxes.map((tax) => ({
					...tax,
					total: String(round(tax.total, 6)),
				})),
			};
		},
		[calculateTaxesFromValue, getShippingLineData]
	);

	return { calculateShippingLineTaxesAndTotals };
};
