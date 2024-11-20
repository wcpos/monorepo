import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

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
				displayTotal: toNumber(item.total) + toNumber(item.total_tax),
				displaySubtotal: toNumber(item.subtotal) + toNumber(item.subtotal_tax),
			};
		}

		return {
			displayTotal: toNumber(item.total),
			displaySubtotal: toNumber(item.subtotal),
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
					<Text className="text-muted-foreground line-through text-right">
						{format(displaySubtotal || 0)}
					</Text>
					{column.columnDef.meta.show('tax') && (
						<Text className="text-sm text-muted-foreground line-through text-right">
							{`${taxDisplayCart} ${format(item.subtotal_tax || 0)} tax`}
						</Text>
					)}
				</>
			)}
			<Text className="text-right">{format(displayTotal || 0)}</Text>
			{column.columnDef.meta.show('tax') && (
				<Text className="text-sm text-muted-foreground text-right">
					{`${taxDisplayCart} ${format(item.total_tax || 0)} tax`}
				</Text>
			)}
		</VStack>
	);
};
