import * as React from 'react';

import { getMetaDataValueByKey, priceToNumber } from './utils';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];

/**
 * Take a fee line object and calculate the tax and totals.
 * Returns the updated fee line object.
 */
export const useCalculateShippingLineTaxAndTotals = () => {
	const { calculateTaxesFromValue } = useTaxCalculator();

	/**
	 *
	 */
	const calculateShippingLineTaxesAndTotals = React.useCallback(
		(shippingLine: Partial<ShippingLine>) => {
			const posData = getMetaDataValueByKey(shippingLine.meta_data, '_woocommerce_pos_data');
			const { amount, prices_include_tax, tax_status, tax_class } = posData
				? JSON.parse(posData)
				: null;

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
		[calculateTaxesFromValue]
	);

	return { calculateShippingLineTaxesAndTotals };
};
