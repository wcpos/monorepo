import * as React from 'react';

import omit from 'lodash/omit';
import pick from 'lodash/pick';
import set from 'lodash/set';

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
interface Changes {
	method_title?: string;
	method_id?: string;
	instance_id?: string;
	amount?: string;
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
	 * Applies updates to a line item based on provided changes.
	 */
	const applyChangesToLineItem = React.useCallback(
		(lineItem: ShippingLine, changes: Changes): ShippingLine => {
			const { amount, prices_include_tax, tax_class, tax_status } = getShippingLineData(lineItem);

			const newData = {
				...{ amount, prices_include_tax, tax_class, tax_status },
				...pick(changes, ['amount', 'prices_include_tax', 'tax_class', 'tax_status']),
			};

			let updatedItem = { ...lineItem };
			updatedItem = updatePosDataMeta(updatedItem, newData);

			const remainingChanges = omit(changes, [
				'amount',
				'prices_include_tax',
				'tax_class',
				'tax_status',
			]);

			for (const key of Object.keys(remainingChanges)) {
				// Special case for nested changes, only meta_data at the moment
				const nestedKey = key.split('.');
				if (nestedKey.length === 1) {
					(updatedItem as any)[key] = remainingChanges[key];
				} else {
					set(updatedItem, nestedKey, remainingChanges[key]);
				}
			}

			return calculateShippingLineTaxesAndTotals(updatedItem);
		},
		[calculateShippingLineTaxesAndTotals, getShippingLineData]
	);

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

			const updatedShippingLines = json.shipping_lines?.map((shippingLine) => {
				if (
					updated ||
					!shippingLine.meta_data?.some(
						(m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid
					)
				) {
					return shippingLine;
				}

				const updatedItem = applyChangesToLineItem(shippingLine, changes);
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
		[applyChangesToLineItem, currentOrder, localPatch]
	);

	return { updateShippingLine };
};
