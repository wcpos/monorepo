import * as React from 'react';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';

/**
 *
 */
export const useAddFee = () => {
	const { calculateTaxesFromValue } = useTaxCalculator();
	const { addItemToOrder } = useAddItemToOrder();

	/**
	 *
	 */
	const addFee = React.useCallback(
		async (data) => {
			const tax = calculateTaxesFromValue({
				value: data.total,
				taxClass: data.tax_class,
				taxStatus: data.tax_status,
				valueIncludesTax: data.prices_include_tax,
			});

			const newFeelLine = {
				...data,
				total_tax: String(tax.total),
				taxes: tax.taxes,
			};

			addItemToOrder('fee_lines', newFeelLine);
		},
		[calculateTaxesFromValue, addItemToOrder]
	);

	return { addFee };
};
