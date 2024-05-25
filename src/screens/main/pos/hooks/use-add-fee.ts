import * as React from 'react';

import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
import { useT } from '../../../../contexts/translations';

/**
 *
 */
export const useAddFee = () => {
	const { addItemToOrder } = useAddItemToOrder();
	const addSnackbar = useSnackbar();
	const t = useT();
	const { calculateFeeLineTaxesAndTotals } = useCalculateFeeLineTaxAndTotals();

	/**
	 *
	 */
	const addFee = React.useCallback(
		async (data) => {
			try {
				const meta_data = Array.isArray(data.meta_data) ? data.meta_data : [];

				meta_data.push({
					key: '_woocommerce_pos_data',
					value: JSON.stringify({
						amount: data.amount,
						percent: data.percent,
						prices_include_tax: data.prices_include_tax,
					}),
				});

				const newFeelLine = calculateFeeLineTaxesAndTotals({
					name: data.name,
					tax_class: data.tax_class,
					tax_status: data.tax_status,
					meta_data,
				});

				await addItemToOrder('fee_lines', newFeelLine);
			} catch (error) {
				log.error(error);
				addSnackbar({
					message: t('Error adding Fee to cart', { _tags: 'core' }),
					type: 'error',
				});
			}
		},
		[calculateFeeLineTaxesAndTotals, addItemToOrder, addSnackbar, t]
	);

	return { addFee };
};
