import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import { useCurrentOrder } from '../../contexts/current-order';
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

/**
 *
 */
export const Subtotal = ({ uuid, item, column }: Props) => {
	const { updateLineItem } = useUpdateLineItem();

	const subtotal = parseFloat(item.subtotal);
	const { format } = useCurrencyFormat();
	const { display } = column;
	const taxStatus = getTaxStatus(item.meta_data) ?? 'taxable';
	const { store } = useAppState();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxHelpers();
	const taxes = calculateTaxesFromPrice({
		price: subtotal,
		taxClass: item.tax_class,
		taxStatus,
		pricesIncludeTax: false,
	});
	const displaySubtotal = taxDisplayCart === 'incl' ? subtotal + taxes.total : subtotal;

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
				value={String(displaySubtotal)}
				onChange={(subtotal) => updateLineItem(uuid, { subtotal })}
				showDecimals
			/>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(item.subtotal_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
