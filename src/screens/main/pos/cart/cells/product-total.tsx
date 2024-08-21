import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';

import type { CellContext } from '@tanstack/react-table';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

/**
 *
 */
export const ProductTotal = ({ row, column }: CellContext<Props, 'total'>) => {
	const item = row.original.item;
	const { format } = useCurrentOrderCurrencyFormat();
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
	 *
	 */
	return (
		<VStack space="xs" className="justify-end">
			{onSale && column.columnDef.meta.show('on_sale') && (
				<>
					<Text className="text-muted-foreground line-through">{format(displaySubtotal || 0)}</Text>
					{column.columnDef.meta.show('tax') && (
						<Text className="text-sm text-muted-foreground line-through">
							{`${taxDisplayCart} ${format(item.subtotal_tax || 0)} tax`}
						</Text>
					)}
				</>
			)}
			<Text>{format(displayTotal || 0)}</Text>
			{column.columnDef.meta.show('tax') && (
				<Text className="text-sm text-muted-foreground">
					{`${taxDisplayCart} ${format(item.total_tax || 0)} tax`}
				</Text>
			)}
		</VStack>
	);
};
