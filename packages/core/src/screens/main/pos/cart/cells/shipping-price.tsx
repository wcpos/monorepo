import * as React from 'react';

import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../../components/currency-input';
import { useShippingLineData } from '../../hooks/use-shipping-line-data';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

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
	const { updateShippingLine } = useUpdateShippingLine();
	const { getShippingLineData } = useShippingLineData();
	const { amount } = getShippingLineData(item);

	/**
	 *
	 */
	return (
		<CurrencyInput value={amount} onChangeText={(amount) => updateShippingLine(uuid, { amount })} />
	);
}
