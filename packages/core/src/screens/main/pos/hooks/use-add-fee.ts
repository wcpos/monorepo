import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useAddItemToOrder } from './use-add-item-to-order';
import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
import { useT } from '../../../../contexts/translations';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart']);

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
	const { currentOrder } = useCurrentOrder();

	// Create order-specific logger
	const orderLogger = React.useMemo(
		() =>
			cartLogger.with({
				orderUUID: currentOrder.uuid,
				orderID: currentOrder.id,
				orderNumber: currentOrder.number,
			}),
		[currentOrder.uuid, currentOrder.id, currentOrder.number]
	);

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
				orderLogger.error(t('pos.error_adding_fee_to_cart'), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						feeName: data.name,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			}
		},
		[calculateFeeLineTaxesAndTotals, addItemToOrder, t, orderLogger]
	);

	return { addFee };
};
