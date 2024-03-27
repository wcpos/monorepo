import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { useTaxCalculation } from './use-tax-calculation';
import { useAppState } from '../../../../../contexts/app-state';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import { useCurrentOrder } from '../../contexts/current-order';

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
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store?.tax_display_cart$ || of('excl'));
	const { calculateTaxesFromPrice } = useTaxHelpers();
	const { calculateLineItemTaxes } = useTaxCalculation();

	/**
	 * Get tax status from line item meta data
	 *
	 * @TODO - default is 'taxable', is this correct?
	 */
	const getTaxStatus = (lineItem: LineItem): string => {
		const taxStatusMetaData = lineItem.meta_data?.find(
			(meta) => meta.key === '_woocommerce_pos_tax_status'
		);
		return taxStatusMetaData?.value ?? 'taxable';
	};

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
			taxStatus: getTaxStatus(lineItem),
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
		const taxStatus = getTaxStatus(lineItem);

		if (taxDisplayCart === 'incl') {
			const taxes = calculateTaxesFromPrice({
				price: newPrice,
				taxClass: lineItem?.tax_class ?? '',
				taxStatus,
				pricesIncludeTax: true,
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
		const taxStatus = getTaxStatus(lineItem);

		if (taxDisplayCart === 'incl') {
			const taxes = calculateTaxesFromPrice({
				price: newSubtotal,
				taxClass: lineItem?.tax_class ?? '',
				taxStatus,
				pricesIncludeTax: true,
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
			order.incrementalPatch({ line_items: updatedLineItems });
		}
	};

	return { updateLineItem };
};
