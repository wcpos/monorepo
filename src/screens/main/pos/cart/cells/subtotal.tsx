import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import useTaxCalculation from '../../../hooks/use-tax-calculation';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

const getTaxStatus = (meta_data) => {
	if (!Array.isArray(meta_data)) return undefined;

	const meta = meta_data.find((meta) => meta && meta.key === '_woocommerce_pos_tax_status');

	return meta ? meta.value : undefined;
};

/**
 *
 */
export const Subtotal = ({ item, column }: Props) => {
	const _subtotal = useObservableState(item.subtotal$, item.subtotal);
	const subtotal = parseFloat(_subtotal);
	const subtotal_tax = useObservableState(item.subtotal_tax$, item.subtotal_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;

	const taxClass = useObservableState(item.tax_class$, item.tax_class);
	// find meta data value when key = _woocommerce_pos_tax_status
	const _taxStatus = useObservableState(
		item.meta_data$.pipe(map((meta_data) => getTaxStatus(meta_data))),
		getTaxStatus(item.meta_data)
	);
	const taxStatus = _taxStatus ?? 'taxable';
	const { store } = useAppState();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxCalculation('pos');
	const taxes = calculateTaxesFromPrice({
		price: subtotal,
		taxClass,
		taxStatus,
		pricesIncludeTax: false,
	});
	const displaySubtotal = taxDisplayCart === 'incl' ? subtotal + taxes.total : subtotal;

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue) => {
			let newSubtotal = parseFloat(newValue);
			if (taxDisplayCart === 'incl') {
				const taxes = calculateTaxesFromPrice({
					price: newSubtotal,
					taxClass,
					taxStatus,
					pricesIncludeTax: true,
				});
				newSubtotal = parseFloat(newValue) - taxes.total;
			}
			item.incrementalPatch({ subtotal: String(newSubtotal) });
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
			<NumberInput value={String(displaySubtotal)} onChange={handleUpdate} showDecimals />
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(subtotal_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
