import * as React from 'react';

import { wooMetaCarrier } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
import { useFeeLineData } from './use-fee-line-data';
import { updatePosDataMeta } from './utils';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'fee-line']);

type OrderDocument = import('@wcpos/database').OrderDocument;
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes extends Partial<FeeLine> {
	amount?: string;
	percent?: boolean;
	prices_include_tax?: boolean;
	percent_of_cart_total_with_tax?: boolean;
}

/**
 *
 */
export const useUpdateFeeLine = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const { calculateFeeLineTaxesAndTotals } = useCalculateFeeLineTaxAndTotals();
	const { getFeeLineData } = useFeeLineData();
	const t = useT();

	/**
	 * Update fee line
	 */
	const updateFeeLine = React.useCallback(
		async (uuid: string, changes: Changes) => {
			const order = currentOrder.getLatest();
			const json = order.toMutableJSON();
			let updated = false;

			const updatedLineItems = json.fee_lines?.map((feeLine) => {
				if (updated || wooMetaCarrier.lineUuid(feeLine) !== uuid) {
					return feeLine;
				}

				// get previous line data from meta_data
				const prevData = getFeeLineData(feeLine);

				// extract the meta_data from the changes
				const { amount, percent, prices_include_tax, percent_of_cart_total_with_tax, ...rest } =
					changes;

				// merge the previous line data with the rest of the changes
				let updatedItem = { ...feeLine, ...rest };

				// apply the changes to the shipping line
				updatedItem = updatePosDataMeta(updatedItem, {
					amount: amount ?? prevData.amount,
					percent: percent ?? prevData.percent,
					prices_include_tax: prices_include_tax ?? prevData.prices_include_tax,
					percent_of_cart_total_with_tax:
						percent_of_cart_total_with_tax ?? prevData.percent_of_cart_total_with_tax,
				});

				updatedItem = calculateFeeLineTaxesAndTotals(updatedItem);
				updated = true;
				return updatedItem;
			});

			if (updated && updatedLineItems) {
				return localPatch({
					document: order,
					data: { fee_lines: updatedLineItems },
				});
			}
			// The uuid isn't in the order document — the cashier edited a stale row
			// (multi-tab is first-class). Cashier-full-information ruling: say so.
			cartLogger.warn('Fee line update targeted a line that is no longer in the cart', {
				showToast: true,
				toast: { title: t('pos_cart.update_fee_not_found') },
				context: { uuid, orderId: order.id },
			});
		},
		[calculateFeeLineTaxesAndTotals, currentOrder, getFeeLineData, localPatch, t]
	);

	return { updateFeeLine };
};
