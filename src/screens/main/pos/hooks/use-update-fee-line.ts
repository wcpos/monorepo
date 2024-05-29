import * as React from 'react';

import set from 'lodash/set';

import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
import { updatePosDataMeta } from './utils';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useFeeLineData } from '../cart/cells/use-fee-line-data';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];

/**
 * Account for string or number changes just in case
 */
interface Changes {
	name?: string;
	total?: string | number;
	amount?: string;
	percent?: boolean;
	prices_include_tax?: boolean;
}

/**
 *
 */
export const useUpdateFeeLine = () => {
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const { calculateFeeLineTaxesAndTotals } = useCalculateFeeLineTaxAndTotals();
	const { getFeeLineData } = useFeeLineData();

	/**
	 * Applies updates to a line item based on provided changes.
	 * Handles complex updates like quantity, price, and subtotal separately to ensure proper tax recalculation.
	 */
	const applyChangesToLineItem = (lineItem: FeeLine, changes: Changes): FeeLine => {
		const { amount, percent, prices_include_tax } = getFeeLineData(lineItem);
		let updatedItem = { ...lineItem };

		const newData: Partial<{ amount: string; percent: boolean; prices_include_tax: boolean }> = {};

		if (changes.amount !== undefined) {
			newData.amount = changes.amount;
			newData.percent = percent;
			newData.prices_include_tax = prices_include_tax;
		}

		if (changes.percent !== undefined) {
			newData.percent = changes.percent;
			newData.amount = amount;
			newData.prices_include_tax = prices_include_tax;
		}

		if (changes.prices_include_tax !== undefined) {
			newData.prices_include_tax = changes.prices_include_tax;
			newData.amount = amount;
			newData.percent = percent;
		}

		if (Object.keys(newData).length > 0) {
			updatedItem = updatePosDataMeta(updatedItem, newData);
		}

		// Handle simpler properties by direct assignment
		for (const key of Object.keys(changes)) {
			if (!['amount', 'percent', 'prices_include_tax'].includes(key)) {
				// Special case for nested changes, only meta_data at the moment
				const nestedKey = key.split('.');
				if (nestedKey.length === 1) {
					(updatedItem as any)[key] = (changes as any)[key];
				} else {
					set(updatedItem, nestedKey, (changes as any)[key]);
				}
			}
		}

		return calculateFeeLineTaxesAndTotals(updatedItem);
	};

	/**
	 * Update fee line
	 *
	 * @TODO - what if more than one property is changed at once?
	 */
	const updateFeeLine = async (uuid: string, changes: Changes) => {
		const order = currentOrder.getLatest();
		const json = order.toMutableJSON();
		let updated = false;

		const updatedLineItems = json.fee_lines?.map((feeLine) => {
			if (
				updated ||
				!feeLine.meta_data?.some((m) => m.key === '_woocommerce_pos_uuid' && m.value === uuid)
			) {
				return feeLine;
			}

			const updatedItem = applyChangesToLineItem(feeLine, changes);
			updated = true;
			return updatedItem;
		});

		if (updated && updatedLineItems) {
			return localPatch({ document: order, data: { fee_lines: updatedLineItems } });
		}
	};

	return { updateFeeLine };
};
