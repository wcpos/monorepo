import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { MoneyInput } from '../../../components/money-input';
import { useUISettings } from '../../../contexts/ui-settings';
import { useLineItemData } from '../../hooks/use-line-item-data';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';
import { ensureNumberArray } from './ensure-number-array';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useCartTableReadOnly } from './read-only';

type LineItem = import('@wcpos/query').OrderLineItem;
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

export function RegularPrice(props: CellContext<Props, 'regular_price'>) {
	return useCartTableReadOnly() ? (
		<ReadOnlyRegularPrice {...props} />
	) : (
		<EditableRegularPrice {...props} />
	);
}

function ReadOnlyRegularPrice({ row }: CellContext<Props, 'regular_price'>) {
	const { getLineItemData } = useLineItemData();
	const { regular_price: value } = getLineItemData(row.original.item);
	const { format } = useCurrentOrderCurrencyFormat();
	return (
		<Text className="text-muted-foreground text-right tabular-nums">
			{format(Number(value ?? 0))}
		</Text>
	);
}

function EditableRegularPrice({ row }: CellContext<Props, 'regular_price'>) {
	const item = row.original.item;
	const uuid = row.original.uuid;
	const { updateCartLine } = useUpdateCartLine();
	const { getLineItemData } = useLineItemData();
	const { regular_price: value } = getLineItemData(item);
	const { format } = useCurrentOrderCurrencyFormat();

	/**
	 * Discounts
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const quickDiscounts = useDocField(uiSettings, (settings) => settings.quickDiscounts);

	/**
	 *
	 */
	return (
		<MoneyInput
			testID="cart-regular-price"
			value={value}
			format={format}
			formatOptions={{ fixedDecimalScale: true }}
			textClassName="text-muted-foreground text-right"
			onChangeText={(regular_price) => updateCartLine('line_items', uuid, { regular_price })}
			discounts={ensureNumberArray(quickDiscounts)}
		/>
	);
}
