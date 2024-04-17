import * as React from 'react';

import { getTaxStatusFromMetaData } from './utils';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useTaxCalculator } from '../../hooks/taxes/use-tax-calculator';
import { useTaxDisplay } from '../../hooks/taxes/use-tax-display';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes {
	name?: string;
	total?: string | number;
}

/**
 *
 */
export const useUpdateFeeLine = () => {
	const { currentOrder } = useCurrentOrder();
	const { inclOrExcl } = useTaxDisplay({ context: 'cart' });
	const { calculateTaxesFromValue, calculateLineItemTaxes } = useTaxCalculator();
	const { localPatch } = useLocalMutation();

	/**
	 * Update name of line item
	 */
	const updateName = (feeLine: FeeLine, name: string): FeeLine => {
		return {
			...feeLine,
			name,
		};
	};

	/**
	 * Update total of fee line
	 */
	const updateTotal = (lineItem: FeeLine, newTotal: number): FeeLine => {
		const taxStatus = getTaxStatusFromMetaData(lineItem.meta_data);

		if (inclOrExcl === 'incl') {
			const taxes = calculateTaxesFromValue({
				value: newTotal,
				taxClass: lineItem?.tax_class ?? '',
				taxStatus,
				valueIncludesTax: true,
			});
			newTotal -= taxes.total;
		}

		// recalculate taxes
		const taxes = calculateLineItemTaxes({
			total: String(newTotal),
			taxStatus,
			taxClass: lineItem.tax_class ?? '',
		});

		return {
			...lineItem,
			total: String(newTotal),
			...taxes,
		};
	};

	/**
	 * Update line item
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateFeeLine = async (uuid: string, changes: Changes) => {
		const order = currentOrder.getLatest();
		let updated = false;

		const updatedFeeLines = order.fee_lines?.map((lineItem) => {
			const uuidMatch = lineItem.meta_data?.some(
				(m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid
			);

			// early return if no match, or we have already updated a line item
			if (updated || !uuidMatch) {
				return lineItem;
			}

			let updatedItem = { ...lineItem };

			if (changes.name !== undefined) {
				updatedItem = updateName(updatedItem, changes.name);
			}

			if (changes.total !== undefined) {
				const total = typeof changes.total === 'number' ? changes.total : Number(changes.total);
				if (!isNaN(total)) updatedItem = updateTotal(updatedItem, total);
			}

			updated = true;
			return updatedItem;
		});

		// if we have updated a line item, patch the order
		if (updated && updatedFeeLines) {
			return localPatch({ document: order, data: { fee_lines: updatedFeeLines } });
		}
	};

	return { updateFeeLine };
};
