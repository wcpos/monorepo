import * as React from 'react';

import toNumber from 'lodash/toNumber';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { readOnlyLineKey, readOnlyTestID, useCartTableReadOnly } from './read-only';
import { useLineTaxLabel } from './use-line-tax-label';
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
	const taxLabel = useLineTaxLabel();
	/**
	 * Get display values if cart includes tax
	 */
	const { displaySubtotal } = React.useMemo(() => {
		if (taxDisplayCart === 'incl') {
			return {
				displaySubtotal: toNumber(item.subtotal) + toNumber(item.subtotal_tax),
			};
		}
		return {
			displaySubtotal: toNumber(item.subtotal),
		};
	}, [item.subtotal, item.subtotal_tax, taxDisplayCart]);
	return (
		<VStack space="xs" className="justify-end">
			{/* The line before cart discounts and coupons, which show once under Subtotal (decision 4A); the product's own sale is struck in the Price cell. */}
			<Text
				testID={
					readOnly ? readOnlyTestID('total', readOnlyLineKey(row.original.uuid, item)) : undefined
				}
				className="text-right font-semibold tabular-nums"
			>
				{format(displaySubtotal || 0)}
			</Text>
			{column.columnDef.meta?.show?.('tax') && (
				<Text variant="key" tabular className="text-right">
					{taxLabel(Number(item.subtotal_tax) || 0)}
				</Text>
			)}
		</VStack>
	);
}
