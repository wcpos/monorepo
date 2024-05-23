import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

interface Props {
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
}

/**
 *
 */
export const Subtotal = ({ item, column }: Props) => {
	const { format } = useCurrencyFormat();
	const { display } = column;
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);

	/**
	 * Get display values if cart includes tax
	 */
	const displaySubtotal = React.useMemo(() => {
		if (taxDisplayCart === 'incl') {
			return parseFloat(item.subtotal) + parseFloat(item.subtotal_tax);
		}

		return item.subtotal;
	}, [item.subtotal, item.subtotal_tax, taxDisplayCart]);

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
			<Text>{format(displaySubtotal || 0)}</Text>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart} ${format(item.subtotal_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
