import * as React from 'react';

import find from 'lodash/find';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../../contexts/translations';
import NumberInput from '../../../components/number-input';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/tailwind/src/table').ColumnProps<LineItem>;
}

export const Quantity = ({ uuid, item, column }: Props) => {
	const { updateLineItem, splitLineItem } = useUpdateLineItem();
	const t = useT();

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(column.display, { key });
			return !!(d && d.show);
		},
		[column.display]
	);

	/**
	 *
	 */
	return (
		<VStack className="justify-center">
			<NumberInput
				value={String(item.quantity)}
				onChange={(quantity) => updateLineItem(uuid, { quantity })}
			/>
			{show('split') && item.quantity > 1 && (
				<Button variant="link" size="sm" onPress={() => splitLineItem(uuid)}>
					<ButtonText>{t('Split', { _tags: 'core', _context: 'Split quantity' })}</ButtonText>
				</Button>
			)}
		</VStack>
	);
};
