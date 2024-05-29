import * as React from 'react';

import set from 'lodash/set';

import { useCalculateShippingLineTaxAndTotals } from './use-calculate-shipping-line-tax-and-totals';
import { updatePosDataMeta } from './utils';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useShippingLineData } from '../cart/cells/use-shipping-line-data';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type ShippingLine = NonNullable<OrderDocument['shipping_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes {
	method_title?: string;
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
	 * Handles complex updates like quantity, price, and subtotal separately to ensure proper tax recalculation.
	 */
	const applyChangesToLineItem = (lineItem: ShippingLine, changes: Changes): ShippingLine => {
		const { amount, prices_include_tax, tax_class, tax_status } = getShippingLineData(lineItem);
		let updatedItem = { ...lineItem };

		const newData: Partial<{
			amount: string;
			prices_include_tax: boolean;
			tax_class: string;
			tax_status: string;
		}> = {};

		if (changes.amount !== undefined) {
			newData.amount = changes.amount;
			newData.prices_include_tax = prices_include_tax;
			newData.tax_class = tax_class;
			newData.tax_status = tax_status;
		}

		if (changes.prices_include_tax !== undefined) {
			newData.prices_include_tax = changes.prices_include_tax;
			newData.amount = amount;
			newData.tax_class = tax_class;
			newData.tax_status = tax_status;
		}

		if (changes.tax_class !== undefined) {
			newData.tax_class = changes.tax_class;
			newData.amount = amount;
			newData.prices_include_tax = prices_include_tax;
			newData.tax_status = tax_status;
		}

		if (changes.tax_status !== undefined) {
			newData.tax_status = changes.tax_status;
			newData.amount = amount;
			newData.prices_include_tax = prices_include_tax;
			newData.tax_class = tax_class;
		}

		if (Object.keys(newData).length > 0) {
			updatedItem = updatePosDataMeta(updatedItem, newData);
		}

		// Handle simpler properties by direct assignment
		for (const key of Object.keys(changes)) {
			if (!['amount', 'prices_include_tax', 'tax_class', 'tax_status'].includes(key)) {
				// Special case for nested changes, only meta_data at the moment
				const nestedKey = key.split('.');
				if (nestedKey.length === 1) {
					(updatedItem as any)[key] = (changes as any)[key];
				} else {
					set(updatedItem, nestedKey, (changes as any)[key]);
				}
			}
		}

		return calculateShippingLineTaxesAndTotals(updatedItem);
	};

	/**
	 * Update shipping line
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateShippingLine = async (uuid: string, changes: Changes) => {
		const order = currentOrder.getLatest();
		const json = order.toMutableJSON();
		let updated = false;

		const updatedShippingLines = json.shipping_lines?.map((shippingLine) => {
			if (
				updated ||
				!shippingLine.meta_data?.some((m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid)
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
	};

	return { updateShippingLine };
};
