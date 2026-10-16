import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../../components/currency-input';
import { useShippingLineData } from '../../hooks/use-shipping-line-data';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';

type ShippingLine = NonNullable<import('@wcpos/database').OrderDocument['shipping_lines']>[number];
interface Props {
	uuid: string;
	item: ShippingLine;
	type: 'line_items';
}

/**
 *
 */
export function ShippingPrice({ row }: CellContext<Props, 'total'>) {
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
