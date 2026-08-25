import * as React from 'react';

import { calculateCartLine } from '@wcpos/order-math';
import { POS_META_KEYS } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportCartFailure } from './cart-failure';
import { useAddItemToOrder } from './use-add-item-to-order';
import { useCartConfig } from './use-cart-config';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';
import { useReportEngineWarnings } from '../contexts/order-engine-warnings';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];

/**
 * No `tax_class`: WooCommerce has no per-line shipping tax class, so the POS does not
 * author one. The class comes from the store's `shipping_tax_class` setting, which the
 * engine reads off `cartConfig`. See `extractShippingLineData` in @wcpos/order-math.
 */
interface ShippingData {
	method_title: string;
	method_id: string;
	amount: string;
	prices_include_tax: boolean;
	tax_status: 'taxable' | 'none';
	meta_data?: { key: string; value: unknown }[];
}

/**
 *
 */
export const useAddShipping = () => {
	const { addItemToOrder } = useAddItemToOrder();
	const t = useT();
	const cartConfig = useCartConfig();
	const { currentOrderRecord } = useCurrentOrder();
	const reportEngineWarnings = useReportEngineWarnings();

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
						tax_status: data.tax_status,
					},
				});

				const { line: newShippingLine, warnings } = calculateCartLine(
					{
						kind: 'shipping',
						line: {
							method_title: data.method_title,
							method_id: data.method_id,
							meta_data,
						},
						cartLineItems: currentOrderRecord.getLatest().payload.line_items ?? [],
					},
					cartConfig
				);
				reportEngineWarnings(warnings, {
					orderId: currentOrderRecord.uuid,
					site: 'useAddShipping',
				});

				// The engine speaks structural line types; this boundary writes back to the
				// DB document they came from.
				if (!(await addItemToOrder('shipping_lines', newShippingLine as ShippingLine))) {
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
		[addItemToOrder, cartConfig, currentOrderRecord, reportEngineWarnings, t, orderLogger]
	);

	return { addShipping };
};
