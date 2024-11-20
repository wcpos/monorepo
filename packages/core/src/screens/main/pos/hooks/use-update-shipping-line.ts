import * as React from 'react';

import { useCalculateShippingLineTaxAndTotals } from './use-calculate-shipping-line-tax-and-totals';
import { useShippingLineData } from './use-shipping-line-data';
import { updatePosDataMeta } from './utils';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type ShippingLine = NonNullable<OrderDocument['shipping_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes extends Partial<ShippingLine> {
	amount?: number;
	prices_include_tax?: boolean;
	tax_status?: string;
	tax_class?: string;
}

/**
 *
 */
export const useUpdateShippingLine = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const { calculateShippingLineTaxesAndTotals } = useCalculateShippingLineTaxAndTotals();
	const { getShippingLineData } = useShippingLineData();

	/**
	 * Update shipping line
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateShippingLine = React.useCallback(
		async (uuid: string, changes: Changes) => {
			const order = currentOrder.getLatest();
			const json = order.toMutableJSON();
			let updated = false;

			// get matching shipping line
			const updatedShippingLines = json.shipping_lines?.map((shippingLine) => {
				if (
					updated ||
					!shippingLine.meta_data?.some(
						(m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid
					)
				) {
					return shippingLine;
				}

				// get previous line data from meta_data
				const prevData = getShippingLineData(shippingLine);

				// extract the meta_data from the changes
				const { amount, prices_include_tax, tax_class, tax_status, ...rest } = changes;

				// merge the previous line data with the rest of the changes
				let updatedItem = { ...shippingLine, ...rest };

				// apply the changes to the shipping line
				updatedItem = updatePosDataMeta(updatedItem, {
					amount: amount ?? prevData.amount,
					prices_include_tax: prices_include_tax ?? prevData.prices_include_tax,
					tax_class: tax_class ?? prevData.tax_class,
					tax_status: tax_status ?? prevData.tax_status,
				});

				// calculate the taxes and totals
				updatedItem = calculateShippingLineTaxesAndTotals(updatedItem);
				updated = true;
				return updatedItem;
			});

			// if we have updated a line item, patch the order
			if (updated && updatedShippingLines) {
				return localPatch({
					document: order,
					data: { shipping_lines: updatedShippingLines },
				});
			}
		},
		[calculateShippingLineTaxesAndTotals, currentOrder, getShippingLineData, localPatch]
	);

	return { updateShippingLine };
};
