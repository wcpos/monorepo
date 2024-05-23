import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useUISettings } from '../../../contexts/ui-settings';
import { useTaxCalculator } from '../../../hooks/taxes/use-tax-calculator';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';
import { getMetaDataValueByKey } from '../../hooks/utils';

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
export const RegularPrice = ({ uuid, item, column }: Props) => {
	const { updateLineItem } = useUpdateLineItem();
	const { display } = column;
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);
	const { format } = useCurrencyFormat();
	const { calculateTaxesFromValue } = useTaxCalculator();

	/**
	 *
	 */
	const { displayPrice, tax } = React.useMemo(() => {
		const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
		const { regular_price, tax_status } = JSON.parse(posData);

		if (regular_price && taxDisplayCart === 'incl' && pricesIncludeTax === 'yes') {
			const taxes = calculateTaxesFromValue({
				value: regular_price,
				taxStatus: tax_status,
				taxClass: item.tax_class,
			});
			return {
				displayPrice: regular_price,
				tax: taxes.total,
			};
		}
	}, [calculateTaxesFromValue, item.meta_data, item.tax_class, pricesIncludeTax, taxDisplayCart]);

	/**
	 * Discounts
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const quickDiscounts = useObservableEagerState(uiSettings.quickDiscounts$);

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *
	 */
	return (
		<>
			<NumberInput
				value={displayPrice}
				onChange={(regular_price) => updateLineItem(uuid, { regular_price })}
				showDecimals
				showDiscounts={ensureNumberArray(quickDiscounts)}
			/>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart} ${format(tax) || 0} tax`}
				</Text>
			)}
		</>
	);
};
