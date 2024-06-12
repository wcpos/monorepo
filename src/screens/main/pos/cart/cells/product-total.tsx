import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState, useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

interface Props {
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
}

/**
 *
 */
export const ProductTotal = ({ item, column }: Props) => {
	const { format } = useCurrentOrderCurrencyFormat();
	const { display } = column;
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);

	/**
	 * Get display values if cart includes tax
	 */
	const { displayTotal, displaySubtotal } = React.useMemo(() => {
		if (taxDisplayCart === 'incl') {
			return {
				displayTotal: parseFloat(item.total) + parseFloat(item.total_tax),
				displaySubtotal: parseFloat(item.subtotal) + parseFloat(item.subtotal_tax),
			};
		}

		return {
			displayTotal: item.total,
			displaySubtotal: item.subtotal,
		};
	}, [item.subtotal, item.subtotal_tax, item.total, item.total_tax, taxDisplayCart]);

	/**
	 * If subtotal and total are different, then item is on sale
	 */
	const onSale = parseFloat(item.total) !== parseFloat(item.subtotal);

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
			{onSale && show('on_sale') && (
				<>
					<Text
						type="textMuted"
						style={{ textDecorationLine: 'line-through', textDecorationStyle: 'solid' }}
					>
						{format(displaySubtotal || 0)}
					</Text>
					{show('tax') && (
						<Text
							type="textMuted"
							size="small"
							style={{ textDecorationLine: 'line-through', textDecorationStyle: 'solid' }}
						>
							{`${taxDisplayCart} ${format(item.subtotal_tax || 0)} tax`}
						</Text>
					)}
				</>
			)}
			<Text>{format(displayTotal || 0)}</Text>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart} ${format(item.total_tax || 0)} tax`}
				</Text>
			)}
		</Box>
	);
};
