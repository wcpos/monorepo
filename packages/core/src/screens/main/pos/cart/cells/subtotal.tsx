import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

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
export const Subtotal = ({ row, column }: CellContext<Props, 'subtotal'>) => {
	const item = row.original.item;
	const { format } = useCurrencyFormat();
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
	return (
		<VStack space="xs" className="justify-end">
			<Text>{format(displaySubtotal || 0)}</Text>
			{column.columnDef.meta?.show('tax') && (
				<Text className="text-sm text-muted-foreground">
					{`${taxDisplayCart} ${format(item.subtotal_tax) || 0} tax`}
				</Text>
			)}
		</VStack>
	);
};
