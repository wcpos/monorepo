import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';
import { NumberInput } from '../../../components/number-input';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

/**
 *
 */
export function Quantity({ row, column }: CellContext<Props, 'quantity'>) {
	const { item, uuid } = row.original;
	const { updateLineItem, splitLineItem } = useUpdateLineItem();
	const t = useT();

	/**
	 *
	 */
	return (
		<VStack className="items-center justify-center gap-1">
			<NumberInput
				testID="cart-quantity-input"
				value={item.quantity}
				onChangeText={(quantity) => updateLineItem(uuid, { quantity })}
			/>
			{column.columnDef.meta?.show?.('split') && (item.quantity ?? 0) > 1 && (
				<Text variant="link" className="text-primary text-sm" onPress={() => splitLineItem(uuid)}>
					{t('pos_cart.split_qty')}
				</Text>
			)}
		</VStack>
	);
}
