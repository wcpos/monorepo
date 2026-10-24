import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { EditableNumber } from '../../../components/editable-number';
import { useUISettings } from '../../../contexts/ui-settings';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useLineItemData } from '../../hooks/use-line-item-data';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';
import { ensureNumberArray } from './ensure-number-array';
import { readOnlyLineKey, readOnlyTestID, useCartTableReadOnly } from './read-only';
type LineItem = import('@wcpos/query').OrderLineItem;
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}
export function Price(props: CellContext<Props, 'price'>) {
	return useCartTableReadOnly() ? <ReadOnlyPrice {...props} /> : <EditablePrice {...props} />;
}

/** The unit price the input shows, as muted text in the order's currency. */
function ReadOnlyPrice({ row, column }: CellContext<Props, 'price'>) {
	const { item, uuid } = row.original;
	const { getLineItemData } = useLineItemData();
	const { price, regular_price } = getLineItemData(item);
	const { format } = useCurrentOrderCurrencyFormat();
	return (
		<VStack space="xs">
			{price !== regular_price && column.columnDef.meta?.show?.('on_sale') && (
				<Text className="text-muted-foreground text-right tabular-nums line-through">
					{format(regular_price || 0)}
				</Text>
			)}
			<Text
				testID={readOnlyTestID('price', readOnlyLineKey(uuid, item))}
				className="text-muted-foreground text-right tabular-nums"
			>
				{format(Number(price ?? 0))}
			</Text>
		</VStack>
	);
}

function EditablePrice({ row, column }: CellContext<Props, 'price'>) {
	const { item, uuid } = row.original;
	const { updateCartLine } = useUpdateCartLine();
	const { getLineItemData } = useLineItemData();
	const { price, regular_price } = getLineItemData(item);
	const { format } = useCurrentOrderCurrencyFormat();
	const isOnSale = price !== regular_price;
	/**
	 * Discounts
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const quickDiscounts = useDocField(uiSettings, (settings) => settings.quickDiscounts);
	return (
		// The cell's width, not its content's: the editor's quick discounts must not widen it.
		<VStack space="xs" className="self-stretch">
			{isOnSale && column.columnDef.meta?.show?.('on_sale') && (
				<Text className="text-muted-foreground text-right tabular-nums line-through">
					{format(regular_price || 0)}
				</Text>
			)}
			<EditableNumber
				testID="cart-price"
				value={price}
				display={format(Number(price ?? 0))}
				formatOptions={{ fixedDecimalScale: true }}
				textClassName="text-muted-foreground text-right"
				onChangeText={(price) => updateCartLine('line_items', uuid, { price })}
				discounts={ensureNumberArray(quickDiscounts)}
			/>
		</VStack>
	);
}
