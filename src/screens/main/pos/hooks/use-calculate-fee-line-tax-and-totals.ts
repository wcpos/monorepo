import * as React from 'react';

import { getMetaDataValueByKey, priceToNumber } from './utils';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];

/**
 * Take a fee line object and calculate the tax and totals.
 * Returns the updated fee line object.
 */
export const useCalculateFeeLineTaxAndTotals = () => {
	const { calculateTaxesFromValue } = useTaxCalculator();

	/**
	 *
	 */
	const calculateFeeLineTaxesAndTotals = React.useCallback(
		(feeLine: Partial<FeeLine>) => {
			const posData = getMetaDataValueByKey(feeLine.meta_data, '_woocommerce_pos_data');
			const { amount, percent, prices_include_tax } = posData ? JSON.parse(posData) : null;

			const tax = calculateTaxesFromValue({
				value: amount,
				taxClass: feeLine.tax_class,
				taxStatus: feeLine.tax_status,
				valueIncludesTax: prices_include_tax,
			});

			const total = prices_include_tax ? priceToNumber(amount) - tax.total : tax.total;

			return {
				...feeLine,
				total: String(total),
				total_tax: String(tax.total),
				taxes: tax.taxes,
			};
		},
		[calculateTaxesFromValue]
	);

	return { calculateFeeLineTaxesAndTotals };
};
