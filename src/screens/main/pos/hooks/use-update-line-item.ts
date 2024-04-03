import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { getTaxStatusFromMetaData } from './utils';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';
import { useTaxDisplay } from '../../hooks/taxes/use-tax-display';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes {
	quantity?: string | number;
	name?: string;
	price?: string | number;
	subtotal?: string | number;
}

/**
 *
 */
export const useUpdateLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { inclOrExcl } = useTaxDisplay({ context: 'cart' });
	const { calculateTaxesFromValue, calculateLineItemTaxes } = useTaxCalculator();

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
	 * Update line item
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateLineItem = async (uuid: string, changes: Changes) => {
		const order = currentOrder.getLatest();
		let updated = false;

		const updatedLineItems = order.line_items?.map((lineItem) => {
			const uuidMatch = lineItem.meta_data?.some(
				(m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid
			);

			// early return if no match, or we have already updated a line item
			if (updated || !uuidMatch) {
				return lineItem;
			}

			let updatedItem = { ...lineItem };

			if (changes.quantity !== undefined) {
				const quantity =
					typeof changes.quantity === 'number' ? changes.quantity : Number(changes.quantity);
				if (!isNaN(quantity)) updatedItem = updateQuantity(updatedItem, quantity);
			}

			if (changes.name !== undefined) {
				updatedItem = updateName(updatedItem, changes.name);
			}

			if (changes.price !== undefined) {
				const price = typeof changes.price === 'number' ? changes.price : Number(changes.price);
				if (!isNaN(price)) updatedItem = updatePrice(updatedItem, price);
			}

			if (changes.subtotal !== undefined) {
				const subtotal =
					typeof changes.subtotal === 'number' ? changes.subtotal : Number(changes.subtotal);
				if (!isNaN(subtotal)) updatedItem = updateSubtotal(updatedItem, subtotal);
			}

			updated = true;
			return updatedItem;
		});

		// if we have updated a line item, patch the order
		if (updated && updatedLineItems) {
			return order.incrementalPatch({ line_items: updatedLineItems });
		}
	};

	/**
	 *
	 */
	const splitLineItem = async (uuid) => {
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
		const newLineItems = [];

		for (let i = 0; i < quantity; i++) {
			const newItem = {
				...lineItemToCopy,
				meta_data: lineItemToCopy.meta_data.map((meta) =>
					meta.key === '_woocommerce_pos_uuid'
						? { ...meta, value: i === 0 ? uuid : uuidv4() }
						: meta
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

		return currentOrder.incrementalPatch({ line_items: updatedLineItems });
	};

	return { updateLineItem, splitLineItem };
};
