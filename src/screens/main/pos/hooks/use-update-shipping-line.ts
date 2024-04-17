import * as React from 'react';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';
import { useTaxDisplay } from '../../hooks/taxes/use-tax-display';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type ShippingLine = NonNullable<OrderDocument['shipping_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes {
	method_title?: string;
	total?: string | number;
}

/**
 *
 */
export const useUpdateShippingLine = () => {
	const { currentOrder } = useCurrentOrder();
	const { inclOrExcl } = useTaxDisplay({ context: 'cart' });
	const { calculateTaxesFromValue, calculateShippingLineTaxes } = useTaxCalculator();
	const { localPatch } = useLocalMutation();

	/**
	 * Update name of line item
	 */
	const updateMethodTitle = (shippingLine: ShippingLine, method_title: string): ShippingLine => {
		return {
			...shippingLine,
			method_title,
		};
	};

	/**
	 * Update total of fee line
	 */
	const updateTotal = (shippingLine: ShippingLine, newTotal: number): ShippingLine => {
		if (inclOrExcl === 'incl') {
			const taxes = calculateTaxesFromValue({
				value: newTotal,
				taxClass: 'standard', // TODO: what to put here?
				taxStatus: 'taxable', // TODO: what to put here?
				valueIncludesTax: true,
			});
			newTotal -= taxes.total;
		}

		// recalculate taxes
		const taxes = calculateShippingLineTaxes({
			total: String(newTotal),
		});

		return {
			...shippingLine,
			total: String(newTotal),
			...taxes,
		};
	};

	/**
	 * Update shipping line
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateShippingLine = async (uuid: string, changes: Changes) => {
		const order = currentOrder.getLatest();
		let updated = false;

		const updatedShippingLines = order.fee_lines?.map((lineItem) => {
			const uuidMatch = lineItem.meta_data?.some(
				(m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid
			);

			// early return if no match, or we have already updated a line item
			if (updated || !uuidMatch) {
				return lineItem;
			}

			let updatedItem = { ...lineItem };

			if (changes.method_title !== undefined) {
				updatedItem = updateMethodTitle(updatedItem, changes.method_title);
			}

			if (changes.total !== undefined) {
				const total = typeof changes.total === 'number' ? changes.total : Number(changes.total);
				if (!isNaN(total)) updatedItem = updateTotal(updatedItem, total);
			}

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
