import * as React from 'react';

import { IconButton } from '@wcpos/components/src/icon-button';

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
		const rowRef = table.options.meta.rowRefs.current.get(uuid);
		if (rowRef && rowRef?.pulseRemove) {
			rowRef.pulseRemove(() => {
				removeLineItem(uuid, type);
			});
		}
	}, [removeLineItem, table.options.meta.rowRefs, type, uuid]);

	/**
	 * Use pulse effect for new rows
	 */
	const isNew = table.options.meta.newRowUUIDs.includes(uuid);
	if (isNew) {
		const rowRef = table.options.meta.rowRefs.current.get(uuid);
		if (rowRef && rowRef?.pulseAdd) {
			rowRef.pulseAdd(() => {
				table.options.meta.newRowUUIDs = table.options.meta.newRowUUIDs.filter((id) => id !== uuid);
			});
		}
	}

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
