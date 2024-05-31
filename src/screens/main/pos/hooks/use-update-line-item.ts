import * as React from 'react';

import omit from 'lodash/omit';
import pick from 'lodash/pick';
import set from 'lodash/set';
import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
import { useLineItemData } from './use-line-item-data';
import { updatePosDataMeta } from './utils';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

/**
 *
 */
export const useUpdateLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const { calculateLineItemTaxesAndTotals } = useCalculateLineItemTaxAndTotals();
	const { getLineItemData } = useLineItemData();

	/**
	 * Applies updates to a line item based on provided changes.
	 */
	const applyChangesToLineItem = (lineItem: LineItem, changes: Partial<LineItem>): LineItem => {
		const { price, regular_price, tax_status } = getLineItemData(lineItem);

		const newData = {
			...{ price, regular_price, tax_status },
			...pick(changes, ['price', 'regular_price', 'tax_status']),
		};

		let updatedItem = { ...lineItem };
		updatedItem = updatePosDataMeta(updatedItem, newData);

		const remainingChanges = omit(changes, ['price', 'regular_price', 'tax_status']);

		for (const key of Object.keys(remainingChanges)) {
			// Special case for nested changes, only meta_data at the moment
			const nestedKey = key.split('.');
			if (nestedKey.length === 1) {
				(updatedItem as any)[key] = remainingChanges[key];
			} else {
				set(updatedItem, nestedKey, remainingChanges[key]);
			}
		}

		return calculateLineItemTaxesAndTotals(updatedItem);
	};

	/**
	 * Update line item
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateLineItem = async (uuid: string, changes: Partial<LineItem>) => {
		const order = currentOrder.getLatest();
		const json = order.toMutableJSON();
		let updated = false;

		const updatedLineItems = json.line_items?.map((lineItem) => {
			if (
				updated ||
				!lineItem.meta_data?.some((m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid)
			) {
				return lineItem;
			}

			const updatedItem = applyChangesToLineItem(lineItem, changes);
			updated = true;
			return updatedItem;
		});

		// if we have updated a line item, patch the order
		if (updated && updatedLineItems) {
			return localPatch({ document: order, data: { line_items: updatedLineItems } });
		}
	};

	/**
	 *
	 */
	const splitLineItem = async (uuid: string) => {
		const order = currentOrder.getLatest();
		const lineItemIndex = order.line_items.findIndex((item) =>
			item.meta_data.some((meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid)
		);

		if (lineItemIndex === -1) {
			console.error('Line item not found');
			return;
		}

		const lineItemToSplit = order.line_items[lineItemIndex];

		if (lineItemToSplit.quantity <= 1) {
			console.error('Line item quantity must be greater than 1');
			return;
		}

		const lineItemToCopy = calculateLineItemTaxesAndTotals({ ...lineItemToSplit, quantity: 1 });
		const quantity = Math.floor(lineItemToSplit.quantity);
		const rawRemainder = lineItemToSplit.quantity - quantity;
		const remainder = parseFloat(rawRemainder.toFixed(6));
		const newLineItems = [{ ...lineItemToCopy }];
		unset(lineItemToCopy, 'id'); // remove id so it is treated as a new item

		for (let i = 1; i < quantity; i++) {
			const newItem = {
				...lineItemToCopy,
				meta_data: lineItemToCopy.meta_data.map((meta) =>
					meta.key === '_woocommerce_pos_uuid' ? { ...meta, value: uuidv4() } : meta
				),
			};
			newLineItems.push(newItem);
		}

		if (remainder > 0) {
			const remainderLineItem = calculateLineItemTaxesAndTotals({
				...lineItemToCopy,
				quantity: remainder,
			});
			const newItem = {
				...remainderLineItem,
				quantity: remainder,
				meta_data: remainderLineItem.meta_data.map((meta) =>
					meta.key === '_woocommerce_pos_uuid' ? { ...meta, value: uuidv4() } : meta
				),
			};
			newLineItems.push(newItem);
		}

		// Replace the original item with the new items in the order
		const updatedLineItems = [
			...order.line_items.slice(0, lineItemIndex),
			...newLineItems,
			...order.line_items.slice(lineItemIndex + 1),
		];

		return localPatch({ document: order, data: { line_items: updatedLineItems } });
	};

	return { updateLineItem, splitLineItem };
};
