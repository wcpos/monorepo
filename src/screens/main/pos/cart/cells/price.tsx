import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';
import useUI from '../../../contexts/ui-settings';
import { useTaxDisplayValues } from '../../../hooks/taxes/use-tax-display-values';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';
import { getTaxStatusFromMetaData } from '../../hooks/utils';

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
export const Price = ({ uuid, item }: Props) => {
	const { updateLineItem } = useUpdateLineItem();

	// find meta data value when key = _woocommerce_pos_tax_status
	const taxStatus = getTaxStatusFromMetaData(item.meta_data);
	const { displayValue } = useTaxDisplayValues({
		value: String(item.price),
		taxClass: item.tax_class,
		taxStatus,
		context: 'cart',
		valueIncludesTax: false,
	});

	/**
	 * Discounts
	 */
	const { uiSettings } = useUI('pos.cart');
	const quickDiscounts = useObservableEagerState(uiSettings.get$('quickDiscounts'));

	/**
	 *
	 */
	return (
		<NumberInput
			value={displayValue}
			onChange={(price) => updateLineItem(uuid, { price })}
			showDecimals
			showDiscounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
