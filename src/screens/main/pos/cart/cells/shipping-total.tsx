import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../../../contexts/local-data';
import NumberInput from '../../../components/number-input';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import useTaxCalculation from '../../../hooks/use-tax-calculation';

interface Props {
	item: import('@wcpos/database').FeeLineDocument;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const ShippingTotal = ({ item, column }: Props) => {
	const _total = useObservableState(item.total$, item.total);
	const total = parseFloat(_total);
	const total_tax = useObservableState(item.total_tax$, item.total_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;
	const { store } = useLocalData();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxCalculation();
	const taxes = calculateTaxesFromPrice({
		price: total,
		taxClass: 'standard', // TODO: what to put here?
		taxStatus: 'taxable', // TODO: what to put here?
		pricesIncludeTax: false,
	});
	const displayTotal = taxDisplayCart === 'incl' ? total + taxes.total : total;

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue) => {
			let total = parseFloat(newValue);
			if (taxDisplayCart === 'incl') {
				const taxes = calculateTaxesFromPrice({
					price: total,
					taxClass: 'standard', // TODO: what to put here?
					taxStatus: 'taxable', // TODO: what to put here?
					pricesIncludeTax: true,
				});
				total = parseFloat(newValue) - taxes.total;
			}
			item.incrementalPatch({ total: String(total) });
		},
		[calculateTaxesFromPrice, item, taxDisplayCart]
	);

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
		<Box space="xSmall" align="end">
			<NumberInput value={String(displayTotal)} onChange={handleUpdate} showDecimals />
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
