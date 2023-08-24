import * as React from 'react';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useTaxHelpers } from '../../contexts/tax-helpers';

/**
 *
 */
export const useAddFee = () => {
	const { calculateTaxesFromPrice } = useTaxHelpers();
	const { addItemToOrder } = useAddItemToOrder();

	/**
	 *
	 */
	const addFee = React.useCallback(
		async (data) => {
			const tax = calculateTaxesFromPrice({
				price: parseFloat(data.total),
				taxClass: data.tax_class,
				taxStatus: data.tax_status,
				pricesIncludeTax: false,
			});

			const newFeelLine = {
				...data,
				total_tax: tax.total,
				taxes: tax.taxes,
			};

			addItemToOrder('fee_lines', newFeelLine);
		},
		[calculateTaxesFromPrice, addItemToOrder]
	);

	return { addFee };
};
