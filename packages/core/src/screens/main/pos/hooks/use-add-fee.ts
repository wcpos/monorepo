import * as React from 'react';

import { Toast } from '@wcpos/components/src/toast';
import log from '@wcpos/utils/src/logger';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
import { useT } from '../../../../contexts/translations';

interface FeeData {
	name: string;
	amount: string;
	percent: boolean;
	prices_include_tax: boolean;
	tax_class: string;
	tax_status: 'taxable' | 'none';
	meta_data: { key: string; value: string }[];
}

/**
 *
 */
export const useAddFee = () => {
	const { addItemToOrder } = useAddItemToOrder();
	const t = useT();
	const { calculateFeeLineTaxesAndTotals } = useCalculateFeeLineTaxAndTotals();

	/**
	 * NOTE: be careful not to mutate the data object passed in, especially the meta_data array.
	 */
	const addFee = React.useCallback(
		async (data: FeeData) => {
			try {
				const meta_data = Array.isArray(data.meta_data) ? [...data.meta_data] : [];

				meta_data.push({
					key: '_woocommerce_pos_data',
					value: JSON.stringify({
						amount: data.amount,
						percent: data.percent,
						prices_include_tax: data.prices_include_tax,
					}),
				});

				const newFeeLine = calculateFeeLineTaxesAndTotals({
					name: data.name,
					tax_class: data.tax_class,
					tax_status: data.tax_status,
					meta_data,
				});

				await addItemToOrder('fee_lines', newFeeLine);
			} catch (error) {
				log.error(error);
				Toast.show({
					type: 'error',
					text1: t('Error adding Fee to cart', { _tags: 'core' }),
				});
			}
		},
		[calculateFeeLineTaxesAndTotals, addItemToOrder, t]
	);

	return { addFee };
};
