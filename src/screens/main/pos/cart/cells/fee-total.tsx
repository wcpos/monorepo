import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppStateManager } from '../../../../../contexts/app-state-manager';
import NumberInput from '../../../components/number-input';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import useTaxCalculation from '../../../hooks/use-tax-calculation';

interface Props {
	item: import('@wcpos/database').FeeLineDocument;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const FeeTotal = ({ item, column }: Props) => {
	const _total = useObservableState(item.total$, item.total);
	const total = parseFloat(_total);
	const total_tax = useObservableState(item.total_tax$, item.total_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;
	const taxClass = useObservableState(item.tax_class$, item.tax_class);
	const taxStatus = useObservableState(item.tax_status$, item.tax_status);
	const appState = useAppStateManager();
	const store = useObservableState(appState.store$, appState.store);
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxCalculation();
	const taxes = calculateTaxesFromPrice({
		price: total,
		taxClass,
		taxStatus,
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
					taxClass,
					taxStatus,
					pricesIncludeTax: true,
				});
				total = parseFloat(newValue) - taxes.total;
			}
			item.incrementalPatch({ total: String(total) });
		},
		[calculateTaxesFromPrice, item, taxClass, taxDisplayCart, taxStatus]
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
