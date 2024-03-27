import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import { useUpdateShippingLine } from '../hooks/use-update-shipping-line';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	column: import('@wcpos/components/src/table').ColumnProps<ShippingLine>;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const ShippingTotal = ({ uuid, item, column }: Props) => {
	const { updateShippingLine } = useUpdateShippingLine();

	const total = parseFloat(item.total);
	const { format } = useCurrencyFormat();
	const { display } = column;
	const { store } = useAppState();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxHelpers();
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
			<NumberInput
				value={String(displayTotal)}
				onChange={(total) => updateShippingLine(uuid, { total })}
				showDecimals
			/>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(item.total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
