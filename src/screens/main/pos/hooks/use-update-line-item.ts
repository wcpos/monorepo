import * as React from 'react';

import { unset } from 'lodash';
import { v4 as uuidv4 } from 'uuid';

import { getTaxStatusFromMetaData } from './utils';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';
import { useTaxDisplay } from '../../hooks/taxes/use-tax-display';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

/**
 *
 */
export const useUpdateLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { inclOrExcl } = useTaxDisplay({ context: 'cart' });
	const { calculateTaxesFromValue, calculateLineItemTaxes } = useTaxCalculator();
	const { localPatch } = useLocalMutation();

	/**
	 * Update quantity of line item
	 */
	const updateQuantity = (lineItem: LineItem, quantity: number): LineItem => {
		const newQuantity = Number(quantity);
		const newSubtotal =
			(parseFloat(lineItem.subtotal ?? '0') / (lineItem.quantity ?? 1)) * newQuantity;
		const newTotal = (parseFloat(lineItem.total ?? '0') / (lineItem.quantity ?? 1)) * newQuantity;

		// recalculate taxes
		const taxes = calculateLineItemTaxes({
			total: String(newTotal),
			subtotal: String(newSubtotal),
			taxStatus: getTaxStatusFromMetaData(lineItem.meta_data),
			taxClass: lineItem.tax_class ?? '',
		});

		return {
			...lineItem,
			quantity: newQuantity,
			subtotal: String(newSubtotal),
			total: String(newTotal),
			...taxes,
		};
	};

	/**
	 * Update name of line item
	 */
	const updateName = (lineItem: LineItem, name: string): LineItem => {
		return {
			...lineItem,
			name,
		};
	};

	/**
	 * Update price of line item
	 */
	const updatePrice = (lineItem: LineItem, newPrice: number): LineItem => {
		const taxStatus = getTaxStatusFromMetaData(lineItem.meta_data);

		if (inclOrExcl === 'incl') {
			const taxes = calculateTaxesFromValue({
				value: newPrice,
				taxClass: lineItem?.tax_class ?? '',
				taxStatus,
				valueIncludesTax: true,
			});
			newPrice -= taxes.total;
		}

		const newTotal = String((lineItem.quantity ?? 1) * newPrice);

		// recalculate taxes
		const taxes = calculateLineItemTaxes({
			total: newTotal,
			subtotal: lineItem.subtotal ?? '0',
			taxStatus,
			taxClass: lineItem.tax_class ?? '',
		});

		return {
			...lineItem,
			price: newPrice,
			total: newTotal,
			...taxes,
		};
	};

	/**
	 * Update subtotal of line item
	 */
	const updateSubtotal = (lineItem: LineItem, newSubtotal: number): LineItem => {
		const taxStatus = getTaxStatusFromMetaData(lineItem.meta_data);

		if (inclOrExcl === 'incl') {
			const taxes = calculateTaxesFromValue({
				value: newSubtotal,
				taxClass: lineItem?.tax_class ?? '',
				taxStatus,
				valueIncludesTax: true,
			});
			newSubtotal -= taxes.total;
		}

		// recalculate taxes
		const taxes = calculateLineItemTaxes({
			total: lineItem.total ?? '0',
			subtotal: String(newSubtotal),
			taxStatus,
			taxClass: lineItem.tax_class ?? '',
		});

		return {
			...lineItem,
			subtotal: String(newSubtotal),
			...taxes,
		};
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

		if (changes.subtotal !== undefined) {
			const subtotal = Number(changes.subtotal);
			if (!isNaN(subtotal)) updatedItem = updateSubtotal(updatedItem, subtotal);
		}

		// Handle simpler properties by direct assignment
		for (const key of Object.keys(changes)) {
			if (!['quantity', 'price', 'subtotal'].includes(key)) {
				updatedItem[key] = changes[key];
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
		let updated = false;

		const updatedLineItems = order.line_items?.map((lineItem) => {
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
