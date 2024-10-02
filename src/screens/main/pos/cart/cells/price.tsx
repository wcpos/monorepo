import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { CurrencyInput } from '../../../components/currency-input';
import { useUISettings } from '../../../contexts/ui-settings';
import { useLineItemData } from '../../hooks/use-line-item-data';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

import type { CellContext } from '@tanstack/react-table';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

function ensureNumberArray(input: string | number[]): number[] {
	if (typeof input === 'string') {
		// Split the string by commas (or another separator if needed), and convert each part to a number
		return input.split(',').map(Number);
	} else if (Array.isArray(input)) {
		// Convert each element of the array to a number
		return input.map(Number);
	} else {
		// If input is neither a string nor an array, return an empty array or handle as needed
		return [];
	}
}

/**
 *
 */
export const Price = ({ row }: CellContext<Props, 'price'>) => {
	const { item, uuid } = row.original;
	const { updateLineItem } = useUpdateLineItem();
	const { getLineItemData } = useLineItemData();
	const { price } = getLineItemData(item);

	/**
	 * Discounts
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const quickDiscounts = useObservableEagerState(uiSettings.quickDiscounts$);

	/**
	 *
	 */
	return (
		<CurrencyInput
			value={parseFloat(price)}
			onChangeText={(price) => updateLineItem(uuid, { price })}
			discounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
