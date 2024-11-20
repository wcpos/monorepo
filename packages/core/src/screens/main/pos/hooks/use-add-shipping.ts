import * as React from 'react';

import { Toast } from '@wcpos/components/src/toast';
import log from '@wcpos/utils/src/logger';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateShippingLineTaxAndTotals } from './use-calculate-shipping-line-tax-and-totals';
import { useT } from '../../../../contexts/translations';

interface ShippingData {
	method_title: string;
	method_id: string;
	amount: string;
	prices_include_tax: boolean;
	tax_status: 'taxable' | 'none';
	tax_class: string;
	meta_data?: { key: string; value: string }[];
}

/**
 *
 */
export const useAddShipping = () => {
	const { addItemToOrder } = useAddItemToOrder();
	const t = useT();
	const { calculateShippingLineTaxesAndTotals } = useCalculateShippingLineTaxAndTotals();

	/**
	 * NOTE: be careful not to mutate the data object passed in, especially the meta_data array.
	 */
	const addShipping = React.useCallback(
		async (data: ShippingData) => {
			try {
				const meta_data = Array.isArray(data.meta_data) ? [...data.meta_data] : [];

				meta_data.push({
					key: '_woocommerce_pos_data',
					value: JSON.stringify({
						amount: data.amount,
						prices_include_tax: data.prices_include_tax,
						tax_class: data.tax_class,
						tax_status: data.tax_status,
					}),
				});

				const newShippingLine = calculateShippingLineTaxesAndTotals({
					method_title: data.method_title,
					method_id: data.method_id,
					meta_data,
				});

				await addItemToOrder('shipping_lines', newShippingLine);
			} catch (error) {
				log.error(error);
				Toast.show({
					type: 'error',
					text1: t('Error adding Shipping to cart', { _tags: 'core' }),
				});
			}
		},
		[addItemToOrder, calculateShippingLineTaxesAndTotals, t]
	);

	return { addShipping };
};
