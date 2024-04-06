import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
type CartItem = LineItem | FeeLine | ShippingLine;

interface Props {
	item: CartItem;
	column: import('@wcpos/components/src/table').ColumnProps<CartItem>;
}

/**
 *
 */
export const ProductTotal = ({ item, column }: Props) => {
	const { format } = useCurrencyFormat();
	const { display } = column;
	const { store } = useAppState();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const displayTotal =
		taxDisplayCart === 'incl' ? parseFloat(item.total) + parseFloat(item.total_tax) : item.total;

	/**
	 * TODO - move this into the ui as a helper function
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	return (
		<Box space="xSmall" align="end">
			<Text>{format(displayTotal || 0)}</Text>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(item.total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
