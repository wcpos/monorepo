import * as React from 'react';

import NumberInput from '../../../components/number-input';
import { useUpdateLineItem } from '../hooks/use-update-line-item';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
}

export const Quantity = ({ uuid, item }: Props) => {
	const { updateLineItem } = useUpdateLineItem();

	/**
	 *
	 */
	return (
		<NumberInput
			value={String(item.quantity)}
			onChange={(quantity) => updateLineItem(uuid, { quantity })}
		/>
	);
};
