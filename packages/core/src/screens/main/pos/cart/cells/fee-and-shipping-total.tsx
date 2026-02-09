import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';

import type { CellContext } from '@tanstack/react-table';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
interface Props {
	uuid: string;
	item: FeeLine | ShippingLine;
	type: 'line_items';
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const FeeAndShippingTotal = ({ row, column }: CellContext<Props, 'total'>) => {
	const item = row.original.item;
	const { format } = useCurrentOrderCurrencyFormat();
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);

	/**
	 * Get display values if cart includes tax
	 */
	const displayTotal = React.useMemo(() => {
		if (taxDisplayCart === 'incl') {
			return parseFloat(item.total ?? '0') + parseFloat(item.total_tax ?? '0');
		}

		return item.total;
	}, [item.total, item.total_tax, taxDisplayCart]);

	/**
	 *
	 */
	return (
		<VStack space="xs" className="justify-end">
			<Text className="text-right">{format(Number(displayTotal) || 0)}</Text>
			{column.columnDef.meta?.show?.('tax') && (
				<Text className="text-muted-foreground text-right text-sm">
					{`${taxDisplayCart} ${format(Number(item.total_tax) || 0)} tax`}
				</Text>
			)}
		</VStack>
	);
};
