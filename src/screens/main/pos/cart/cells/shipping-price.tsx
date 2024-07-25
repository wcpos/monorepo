import * as React from 'react';

import NumberInput from '../../../components/number-input';
import { useShippingLineData } from '../../hooks/use-shipping-line-data';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	column: import('@wcpos/tailwind/src/table').ColumnProps<ShippingLine>;
}

/**
 *
 */
export const ShippingPrice = ({ uuid, item, column }: Props) => {
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
