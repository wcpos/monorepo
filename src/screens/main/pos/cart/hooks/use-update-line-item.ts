import * as React from 'react';

import find from 'lodash/find';
import uniq from 'lodash/uniq';
import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

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
}

/**
 *
 */
export const useUpdateLineItem = () => {
	const { currentOrder } = useCurrentOrder();
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store?.tax_display_cart$ || of('excl'));
	const { calculateTaxesFromPrice } = useTaxHelpers();

	/**
	 *
	 */
	const calculateLineItemTaxes = ({
		total,
		subtotal,
		taxClass,
		taxStatus,
	}: {
		total: string;
		subtotal?: string;
		taxClass?: string;
		taxStatus?: string;
	}) => {
		const noSubtotal = subtotal === undefined;
		let subtotalTaxes = { total: 0, taxes: [] as { id: number; total: string }[] };

		if (!noSubtotal) {
			subtotalTaxes = calculateTaxesFromPrice({
				price: parseFloat(subtotal),
				taxClass,
				taxStatus,
				pricesIncludeTax: false,
			});
		}

		const totalTaxes = calculateTaxesFromPrice({
			price: parseFloat(total),
			taxClass,
			taxStatus,
			pricesIncludeTax: false,
		});

		const uniqueTaxIds = uniq([
			...subtotalTaxes.taxes.map((tax) => tax.id),
			...totalTaxes.taxes.map((tax) => tax.id),
		]);

		const taxes = uniqueTaxIds.map((id) => {
			const subtotalTax = find(subtotalTaxes.taxes, { id }) || { total: 0 };
			const totalTax = find(totalTaxes.taxes, { id }) || { total: 0 };
			return {
				id,
				subtotal: noSubtotal ? '' : String(subtotalTax.total),
				total: String(totalTax.total),
			};
		});

		const result: {
			total_tax: string;
			subtotal_tax?: string;
			taxes: { id: number; subtotal: string; total: string }[];
		} = {
			total_tax: String(totalTaxes.total),
			taxes,
		};

		if (!noSubtotal) {
			result.subtotal_tax = String(subtotalTaxes.total);
		}

		return result;
	};

	/**
	 * Update quantity of line item
	 */
	const updateQuantity = (lineItem: LineItem, quantity: number): LineItem => {
		const newQuantity = Number(quantity);
		const newSubtotal =
			(parseFloat(lineItem.subtotal ?? '0') / (lineItem.quantity ?? 1)) * newQuantity;
		const newTotal = (parseFloat(lineItem.total ?? '0') / (lineItem.quantity ?? 1)) * newQuantity;
		return {
			...lineItem,
			quantity: newQuantity,
			subtotal: String(newSubtotal),
			total: String(newTotal),
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
		const taxStatusMetaData = lineItem.meta_data?.find(
			(meta) => meta.key === '_woocommerce_pos_tax_status'
		);
		const taxStatus = taxStatusMetaData?.value ?? 'taxable';

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

		return {
			...lineItem,
			price: newPrice,
			total: newTotal,
		};
	};

	/**
	 * Update line item
	 */
	const updateLineItem = async (uuid: string, changes: Changes) => {
		const order = currentOrder.getLatest();
		const updatedLineItems = order.line_items?.map((lineItem) => {
			if (
				lineItem.meta_data?.some(
					(meta) => meta.key === '_woocommerce_pos_uuid' && meta.value === uuid
				)
			) {
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

				return updatedItem;
			}
			return lineItem;
		});

		if (updatedLineItems) {
			order.incrementalPatch({ line_items: updatedLineItems });
		}
	};

	return { updateLineItem };
};
