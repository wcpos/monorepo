import * as React from 'react';

import toNumber from 'lodash/toNumber';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { readOnlyLineKey, readOnlyTestID, useCartTableReadOnly } from './read-only';
type LineItem = import('@wcpos/query').OrderLineItem;
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}
export function ProductTotal({ row, column }: CellContext<Props, 'total'>) {
	const item = row.original.item;
	const readOnly = useCartTableReadOnly();
	const { format } = useCurrentOrderCurrencyFormat();
	const { store } = useAppState();
	const taxDisplayCart = useDocField(store, (value) => value.tax_display_cart);
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
	const onSale = parseFloat(item.total ?? '0') !== parseFloat(item.subtotal ?? '0');
	return (
		<VStack space="xs" className="justify-end">
			{onSale && column.columnDef.meta?.show?.('on_sale') && (
				<>
					<Text className="text-muted-foreground text-right tabular-nums line-through">
						{format(displaySubtotal || 0)}
					</Text>
					{column.columnDef.meta?.show?.('tax') && (
						<Text className="text-muted-foreground text-right text-sm tabular-nums line-through">
							{`${taxDisplayCart} ${format(Number(item.subtotal_tax) || 0)} tax`}
						</Text>
					)}
				</>
			)}
			<Text
				testID={
					readOnly ? readOnlyTestID('total', readOnlyLineKey(row.original.uuid, item)) : undefined
				}
				className="text-right font-semibold tabular-nums"
			>
				{format(displayTotal || 0)}
			</Text>
			{column.columnDef.meta?.show?.('tax') && (
				<Text className="text-muted-foreground text-right text-sm tabular-nums">
					{`${taxDisplayCart} ${format(Number(item.total_tax) || 0)} tax`}
				</Text>
			)}
		</VStack>
	);
}
