import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];

interface Props {
	item: LineItem;
	column: import('@wcpos/tailwind/src/table').ColumnProps<LineItem>;
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
		<VStack space="xs" className="justify-end">
			{onSale && show('on_sale') && (
				<>
					<Text className="text-muted-foreground line-through">{format(displaySubtotal || 0)}</Text>
					{show('tax') && (
						<Text className="text-sm text-muted-foreground line-through">
							{`${taxDisplayCart} ${format(item.subtotal_tax || 0)} tax`}
						</Text>
					)}
				</>
			)}
			<Text>{format(displayTotal || 0)}</Text>
			{show('tax') && (
				<Text className="text-sm text-muted-foreground">
					{`${taxDisplayCart} ${format(item.total_tax || 0)} tax`}
				</Text>
			)}
		</VStack>
	);
};
