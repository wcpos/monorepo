import * as React from 'react';

import omit from 'lodash/omit';
import pick from 'lodash/pick';
import set from 'lodash/set';

import { useCalculateFeeLineTaxAndTotals } from './use-calculate-fee-line-tax-and-totals';
import { useFeeLineData } from './use-fee-line-data';
import { updatePosDataMeta } from './utils';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
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
	 */
	const applyChangesToLineItem = (lineItem: FeeLine, changes: Changes): FeeLine => {
		const { amount, percent, prices_include_tax } = getFeeLineData(lineItem);

		const newData = {
			...{ amount, percent, prices_include_tax },
			...pick(changes, ['amount', 'percent', 'prices_include_tax']),
		};

		let updatedItem = { ...lineItem };
		updatedItem = updatePosDataMeta(updatedItem, newData);

		const remainingChanges = omit(changes, ['amount', 'percent', 'prices_include_tax']);

		for (const key of Object.keys(remainingChanges)) {
			// Special case for nested changes, only meta_data at the moment
			const nestedKey = key.split('.');
			if (nestedKey.length === 1) {
				(updatedItem as any)[key] = remainingChanges[key];
			} else {
				set(updatedItem, nestedKey, remainingChanges[key]);
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
