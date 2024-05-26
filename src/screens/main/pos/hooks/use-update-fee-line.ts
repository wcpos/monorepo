import * as React from 'react';

import set from 'lodash/set';

import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
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
	const { calculateFeeLineTaxesAndTotals } = useCalculateFeeLineTaxAndTotals();

	/**
	 * Update amount
	 */
	const updateAmount = (lineItem: FeeLine, amount: string): FeeLine => {
		const meta_data = lineItem.meta_data ?? [];

		const updatedMetaData = meta_data.map((meta) => {
			if (meta.key === '_woocommerce_pos_data') {
				const posData = JSON.parse(meta.value);
				posData.amount = amount;
				return {
					...meta,
					value: JSON.stringify(posData),
				};
			}
			return meta;
		});

		return calculateFeeLineTaxesAndTotals({
			...lineItem,
			meta_data: updatedMetaData,
		});
	};

	/**
	 * Update percent
	 */
	const updatePercent = (lineItem: FeeLine, percent: boolean): FeeLine => {
		const meta_data = lineItem.meta_data ?? [];

		const updatedMetaData = meta_data.map((meta) => {
			if (meta.key === '_woocommerce_pos_data') {
				const posData = JSON.parse(meta.value);
				posData.percent = percent;
				return {
					...meta,
					value: JSON.stringify(posData),
				};
			}
			return meta;
		});

		return calculateFeeLineTaxesAndTotals({
			...lineItem,
			meta_data: updatedMetaData,
		});
	};

	/**
	 * Update percent
	 */
	const updatePricesIncludeTax = (lineItem: FeeLine, prices_include_tax: boolean): FeeLine => {
		const meta_data = lineItem.meta_data ?? [];

		const updatedMetaData = meta_data.map((meta) => {
			if (meta.key === '_woocommerce_pos_data') {
				const posData = JSON.parse(meta.value);
				posData.prices_include_tax = prices_include_tax;
				return {
					...meta,
					value: JSON.stringify(posData),
				};
			}
			return meta;
		});

		return calculateFeeLineTaxesAndTotals({
			...lineItem,
			meta_data: updatedMetaData,
		});
	};

	/**
	 * Applies updates to a line item based on provided changes.
	 * Handles complex updates like quantity, price, and subtotal separately to ensure proper tax recalculation.
	 */
	const applyChangesToLineItem = (lineItem: FeeLine, changes: Changes): FeeLine => {
		let updatedItem = { ...lineItem };

		// Handle complex properties with specific logic
		if (changes.amount !== undefined) {
			updatedItem = updateAmount(updatedItem, changes.amount);
		}

		if (changes.percent !== undefined) {
			updatedItem = updatePercent(updatedItem, changes.percent);
		}

		if (changes.prices_include_tax !== undefined) {
			updatedItem = updatePricesIncludeTax(updatedItem, changes.prices_include_tax);
		}

		// Handle simpler properties by direct assignment
		for (const key of Object.keys(changes)) {
			if (!['amount', 'percent', 'prices_include_tax'].includes(key)) {
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
