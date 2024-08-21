import * as React from 'react';

import NumberInput from '../../../components/number-input';
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
		<NumberInput
			value={amount}
			onChange={(amount) => updateShippingLine(uuid, { amount })}
			showDecimals
			// showDiscounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
