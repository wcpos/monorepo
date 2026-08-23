import * as React from 'react';

import { calculateCartLine } from '@wcpos/order-math';
import { POS_META_KEYS } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { reportCartFailure } from './cart-failure';
import { useAddItemToOrder } from './use-add-item-to-order';
import { useCartConfig } from './use-cart-config';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];

interface FeeData {
	name: string;
	amount: string;
	percent: boolean;
	prices_include_tax: boolean;
	tax_class: string;
	tax_status: 'taxable' | 'none';
	meta_data: { key: string; value: unknown }[];
}

/**
 *
 */
export const useAddFee = () => {
	const { addItemToOrder } = useAddItemToOrder();
	const t = useT();
	const cartConfig = useCartConfig();
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
	const addFee = React.useCallback(
		async (data: FeeData) => {
			try {
				const meta_data = Array.isArray(data.meta_data) ? [...data.meta_data] : [];

				meta_data.push({
					key: POS_META_KEYS.posData,
					value: {
						amount: data.amount,
						percent: data.percent,
						prices_include_tax: data.prices_include_tax,
					},
				});

				// The percent basis is an EXPLICIT input now. The retired hook reached for
				// `currentOrderRecord.getLatest()` in the middle of its own arithmetic; read
				// it once, here, so the lines the fee is a percentage OF are visible at the
				// call site rather than fetched from under it.
				//
				// `warnings` (malformed pos_data) is dropped here, as it is at every other
				// engine call site in core — settle drops it too.
				const { line: newFeeLine } = calculateCartLine(
					{
						kind: 'fee',
						line: {
							name: data.name,
							tax_class: data.tax_class,
							tax_status: data.tax_status,
							meta_data,
						},
						cartLineItems: currentOrderRecord.getLatest().payload.line_items ?? [],
					},
					cartConfig
				);

				// The engine speaks structural line types; this boundary writes back to the
				// DB document they came from.
				if (!(await addItemToOrder('fee_lines', newFeeLine as FeeLine))) {
					return;
				}

				// Log fee added success
				orderLogger.info(t('pos.fee_added', { feeName: data.name }), {
					context: {
						feeName: data.name,
						amount: data.amount,
						isPercent: data.percent,
						total: newFeeLine.total,
					},
				});
			} catch (error) {
				reportCartFailure(orderLogger, 'Failed to add fee to cart', {
					toastTitle: t('pos.error_adding_fee_to_cart'),
					context: { feeName: data.name },
					error,
				});
			}
		},
		[cartConfig, currentOrderRecord, addItemToOrder, t, orderLogger]
	);

	return { addFee };
};
