import * as React from 'react';

import { Text } from '@wcpos/components/text';
import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../../components/currency-input';
import { useShippingLineData } from '../../hooks/use-shipping-line-data';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useCartTableReadOnly } from './read-only';

type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
interface Props {
	uuid: string;
	item: ShippingLine;
	type: 'line_items';
}

export function ShippingPrice(props: CellContext<Props, 'total'>) {
	return useCartTableReadOnly() ? (
		<ReadOnlyShippingPrice {...props} />
	) : (
		<EditableShippingPrice {...props} />
	);
}

function ReadOnlyShippingPrice({ row }: CellContext<Props, 'total'>) {
	const { getShippingLineData } = useShippingLineData();
	const { amount } = getShippingLineData(row.original.item);
	const { format } = useCurrentOrderCurrencyFormat();
	return (
		<Text className="text-muted-foreground text-right tabular-nums">
			{format(Number(amount) || 0)}
		</Text>
	);
}

function EditableShippingPrice({ row }: CellContext<Props, 'total'>) {
	const { item, uuid } = row.original;
	const { updateCartLine } = useUpdateCartLine();
	const { getShippingLineData } = useShippingLineData();
	const { amount } = getShippingLineData(item);

	/**
	 *
	 */
	return (
		<CurrencyInput
			value={amount}
			onChangeText={(amount) => updateCartLine('shipping_lines', uuid, { amount })}
		/>
	);
}
