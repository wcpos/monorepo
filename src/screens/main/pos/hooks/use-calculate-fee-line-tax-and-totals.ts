import * as React from 'react';

import { priceToNumber } from './utils';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';
import { useFeeLineData } from '../cart/cells/use-fee-line-data';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];

/**
 * Take a fee line object and calculate the tax and totals.
 * Returns the updated fee line object.
 */
export const useCalculateFeeLineTaxAndTotals = () => {
	const { calculateTaxesFromValue } = useTaxCalculator();
	const { getFeeLineData } = useFeeLineData();

	/**
	 *
	 */
	const calculateFeeLineTaxesAndTotals = React.useCallback(
		(feeLine: Partial<FeeLine>) => {
			const { amount, percent, prices_include_tax } = getFeeLineData(feeLine);

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
		[calculateTaxesFromValue, getFeeLineData]
	);

	return { calculateFeeLineTaxesAndTotals };
};
