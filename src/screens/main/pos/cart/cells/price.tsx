import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';
import { useUISettings } from '../../../contexts/ui-settings';
import { useLineItemData } from '../../hooks/use-line-item-data';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
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
export const Price = ({ uuid, item, column }: Props) => {
	const { updateLineItem } = useUpdateLineItem();
	const { getLineItemDisplayPriceAndTax } = useLineItemData();
	const { displayPrice } = getLineItemDisplayPriceAndTax(item);

	/**
	 * Discounts
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const quickDiscounts = useObservableEagerState(uiSettings.quickDiscounts$);

	/**
	 *
	 */
	return (
		<NumberInput
			value={displayPrice}
			onChange={(price) => updateLineItem(uuid, { price })}
			showDecimals
			showDiscounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
