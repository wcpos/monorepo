import * as React from 'react';

import { IconButton } from '@wcpos/tailwind/src/icon-button';

import { useRemoveLineItem } from '../../hooks/use-remove-line-item';

import type { CellContext } from '@tanstack/react-table';

interface Props {
	uuid: string;
	type: 'line_items';
	item:
		| import('@wcpos/database').OrderDocument['line_items']
		| import('@wcpos/database').OrderDocument['fee_lines']
		| import('@wcpos/database').OrderDocument['shipping_lines'];
}

export const Actions = ({ row, table }: CellContext<Props, 'actions'>) => {
	const { uuid, type } = row.original;
	const { removeLineItem } = useRemoveLineItem();

	/**
	 *
	 */
	const handleRemoveLineItem = React.useCallback(() => {
		const rowRef = table.options.meta.rowRefs.current.get(row.id);
		if (rowRef) {
			rowRef.pulseRemove(() => {
				removeLineItem(uuid, type);
			});
		}
	}, [removeLineItem, row.id, table.options.meta.rowRefs, type, uuid]);

	/**
	 *
	 */
	return (
		<IconButton
			name="circleXmark"
			variant="destructive"
			size="4xl"
			onPress={handleRemoveLineItem}
		/>
	);
};
