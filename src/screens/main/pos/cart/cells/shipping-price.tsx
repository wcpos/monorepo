import * as React from 'react';

import { useShippingLineData } from './use-shipping-line-data';
import NumberInput from '../../../components/number-input';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	column: import('@wcpos/components/src/table').ColumnProps<ShippingLine>;
}

/**
 *
 */
export const ShippingPrice = ({ uuid, item, column }: Props) => {
	const { updateShippingLine } = useUpdateShippingLine();
	const { getShippingLineDisplayPrice } = useShippingLineData();
	const displayPrice = getShippingLineDisplayPrice(item);

	/**
	 *
	 */
	return (
		<NumberInput
			value={displayPrice}
			onChange={(amount) => updateShippingLine(uuid, { amount })}
			showDecimals
			// showDiscounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
