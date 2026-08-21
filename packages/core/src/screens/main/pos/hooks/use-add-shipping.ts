import * as React from 'react';

import { POS_META_KEYS } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportCartFailure } from './cart-failure';
import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateShippingLineTaxAndTotals } from './use-calculate-shipping-line-tax-and-totals';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

interface ShippingData {
	method_title: string;
	method_id: string;
	amount: string;
	prices_include_tax: boolean;
	tax_status: 'taxable' | 'none';
	tax_class: string;
	meta_data?: { key: string; value: unknown }[];
}

/**
 *
 */
export const useAddShipping = () => {
	const { addItemToOrder } = useAddItemToOrder();
	const t = useT();
	const { calculateShippingLineTaxesAndTotals } = useCalculateShippingLineTaxAndTotals();
	const { currentOrderRecord } = useCurrentOrder();

	// Create order-specific logger
	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrderRecord.uuid,
				orderID: currentOrderRecord.payload.id,
				orderNumber: currentOrderRecord.payload.number,
			}),
		[currentOrderRecord]
	);

	/**
	 * NOTE: be careful not to mutate the data object passed in, especially the meta_data array.
	 */
	const addShipping = React.useCallback(
		async (data: ShippingData) => {
			try {
				const meta_data = Array.isArray(data.meta_data) ? [...data.meta_data] : [];

				meta_data.push({
					key: POS_META_KEYS.posData,
					value: {
						amount: data.amount,
						prices_include_tax: data.prices_include_tax,
						tax_class: data.tax_class,
						tax_status: data.tax_status,
					},
				});

				const newShippingLine = calculateShippingLineTaxesAndTotals({
					method_title: data.method_title,
					method_id: data.method_id,
					meta_data,
				});

				if (!(await addItemToOrder('shipping_lines', newShippingLine))) {
					return;
				}

				// Log shipping added success
				orderLogger.info(t('pos.shipping_added', { methodTitle: data.method_title }), {
					context: {
						methodTitle: data.method_title,
						methodId: data.method_id,
						amount: data.amount,
						total: newShippingLine.total,
					},
				});
			} catch (error) {
				reportCartFailure(orderLogger, 'Failed to add shipping to cart', {
					toastTitle: t('pos.error_adding_shipping_to_cart'),
					context: {
						methodTitle: data.method_title,
						methodId: data.method_id,
					},
					error,
				});
			}
		},
		[addItemToOrder, calculateShippingLineTaxesAndTotals, t, orderLogger]
	);

	return { addShipping };
};
