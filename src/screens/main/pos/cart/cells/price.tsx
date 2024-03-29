import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import useUI from '../../../contexts/ui-settings';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
}

const getTaxStatus = (meta_data) => {
	if (!Array.isArray(meta_data)) return undefined;

	const meta = meta_data.find((meta) => meta && meta.key === '_woocommerce_pos_tax_status');

	return meta ? meta.value : undefined;
};

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
	const taxStatus = getTaxStatus(item.meta_data) ?? 'taxable';
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);
	const { calculateTaxesFromPrice } = useTaxHelpers();
	const taxes = calculateTaxesFromPrice({
		price: item.price,
		taxClass: item.tax_class,
		taxStatus,
		pricesIncludeTax: false,
	});
	const displayPrice = taxDisplayCart === 'incl' ? item.price + taxes.total : item.price;

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
			value={String(displayPrice)}
			onChange={(price) => updateLineItem(uuid, { price })}
			showDecimals
			showDiscounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
