import * as React from 'react';

import find from 'lodash/find';

import Box from '@wcpos/components/src/box';
import Link from '@wcpos/components/src/link';

import { useT } from '../../../../../contexts/translations';
import NumberInput from '../../../components/number-input';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
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
		<Box space="small" align="center">
			<NumberInput
				value={String(item.quantity)}
				onChange={(quantity) => updateLineItem(uuid, { quantity })}
			/>
			{show('split') && item.quantity > 1 && (
				<Link size="small" onPress={() => splitLineItem(uuid)}>
					{t('Split', { _tags: 'core', _context: 'Split quantity' })}
				</Link>
			)}
		</Box>
	);
};
