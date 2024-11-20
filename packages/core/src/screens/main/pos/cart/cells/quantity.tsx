import * as React from 'react';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../../contexts/translations';
import { NumberInput } from '../../../components/number-input';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

import type { CellContext } from '@tanstack/react-table';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}

/**
 *
 */
export const Quantity = ({ row, column }: CellContext<Props, 'quantity'>) => {
	const { item, uuid } = row.original;
	const { updateLineItem, splitLineItem } = useUpdateLineItem();
	const t = useT();

	/**
	 *
	 */
	return (
		<VStack className="justify-center items-center gap-1">
			<NumberInput
				value={item.quantity}
				onChangeText={(quantity) => updateLineItem(uuid, { quantity })}
			/>
			{column.columnDef.meta.show('split') && item.quantity > 1 && (
				<Text variant="link" className="text-sm text-primary" onPress={() => splitLineItem(uuid)}>
					{t('Split', { _tags: 'core', _context: 'Split quantity' })}
				</Text>
			)}
		</VStack>
	);
};
