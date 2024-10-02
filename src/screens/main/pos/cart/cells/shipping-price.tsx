import * as React from 'react';

import { CurrencyInput } from '../../../components/currency-input';
import { useShippingLineData } from '../../hooks/use-shipping-line-data';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

import type { CellContext } from '@tanstack/react-table';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	type: 'line_items';
}

/**
 *
 */
export const ShippingPrice = ({ row }: CellContext<Props, 'total'>) => {
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
};
