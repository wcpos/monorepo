import * as React from 'react';

import set from 'lodash/set';
import unset from 'lodash/unset';
import { v4 as uuidv4 } from 'uuid';

import { useCalculateLineItemTaxAndTotals } from './use-calculate-line-item-tax-and-totals';
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

	/**
	 * Update quantity of line item
	 */
	const updateQuantity = (lineItem: LineItem, quantity: number): LineItem => {
		return calculateLineItemTaxesAndTotals({
			...lineItem,
			quantity: Number(quantity),
		});
	};

	/**
	 * Update price of line item
	 */
	const updatePrice = (lineItem: LineItem, newPrice: number): LineItem => {
		const meta_data = lineItem.meta_data ?? [];

		const updatedMetaData = meta_data.map((meta) => {
			if (meta.key === '_woocommerce_pos_data') {
				const posData = JSON.parse(meta.value);
				posData.price = String(newPrice);
				return {
					...meta,
					value: JSON.stringify(posData),
				};
			}
			return meta;
		});

		return calculateLineItemTaxesAndTotals({
			...lineItem,
			meta_data: updatedMetaData,
		});
	};

	/**
	 * Update subtotal of line item
	 */
	const updateRegularPrice = (lineItem: LineItem, newRegularPrice: number): LineItem => {
		const meta_data = lineItem.meta_data ?? [];

		const updatedMetaData = meta_data.map((meta) => {
			if (meta.key === '_woocommerce_pos_data') {
				const posData = JSON.parse(meta.value);
				posData.regular_price = String(newRegularPrice);
				return {
					...meta,
					value: JSON.stringify(posData),
				};
			}
			return meta;
		});

		return calculateLineItemTaxesAndTotals({
			...lineItem,
			meta_data: updatedMetaData,
		});
	};

	/**
	 * Update tax status of line item
	 */
	const updateTaxStatus = (lineItem: LineItem, taxStatus: boolean): LineItem => {
		const meta_data = lineItem.meta_data ?? [];

		const updatedMetaData = meta_data.map((meta) => {
			if (meta.key === '_woocommerce_pos_data') {
				const posData = JSON.parse(meta.value);
				posData.tax_status = taxStatus;
				return {
					...meta,
					value: JSON.stringify(posData),
				};
			}
			return meta;
		});

		return calculateLineItemTaxesAndTotals({
			...lineItem,
			meta_data: updatedMetaData,
		});
	};

	/**
	 * Update tax class of line item
	 */
	const updateTaxClass = (lineItem: LineItem, taxClass: string): LineItem => {
		const updatedItem = { ...lineItem, tax_class: taxClass };
		return calculateLineItemTaxesAndTotals(updatedItem);
	};

	/**
	 * Applies updates to a line item based on provided changes.
	 * Handles complex updates like quantity, price, and subtotal separately to ensure proper tax recalculation.
	 */
	const applyChangesToLineItem = (lineItem: LineItem, changes: Partial<LineItem>): LineItem => {
		let updatedItem = { ...lineItem };

		// Handle complex properties with specific logic
		if (changes.quantity !== undefined) {
			const quantity = Number(changes.quantity);
			if (!isNaN(quantity)) updatedItem = updateQuantity(updatedItem, quantity);
		}

		if (changes.price !== undefined) {
			const price = Number(changes.price);
			if (!isNaN(price)) updatedItem = updatePrice(updatedItem, price);
		}

		if (changes.regular_price !== undefined) {
			const regular_price = Number(changes.regular_price);
			if (!isNaN(regular_price)) updatedItem = updateRegularPrice(updatedItem, regular_price);
		}

		if (changes.tax_status !== undefined) {
			updatedItem = updateTaxStatus(updatedItem, changes.tax_status);
		}

		if (changes.tax_class !== undefined) {
			updatedItem = updateTaxClass(updatedItem, changes.tax_class);
		}

		// Handle simpler properties by direct assignment
		for (const key of Object.keys(changes)) {
			if (!['quantity', 'price', 'regular_price', 'tax_status', 'tax_class'].includes(key)) {
				// special case for nested changes, only meta_data at the momemnt
				const nestedKey = key.split('.');
				if (nestedKey.length === 1) {
					updatedItem[key] = changes[key];
				} else {
					set(updatedItem, nestedKey, changes[key]);
				}
			}
		}

		return updatedItem;
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

		const lineItemToCopy = updateQuantity(lineItemToSplit, 1);
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
			const remainderLineItem = updateQuantity(lineItemToCopy, remainder);
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
