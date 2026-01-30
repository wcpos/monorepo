import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';

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
	 * Use pulse effect for new rows.
	 *
	 * useEffect is needed here because rowRef.pulseAdd() runs its callback after
	 * the ~800ms animation completes. Cleanup of table.options.meta.newRowUUIDs
	 * must happen at that point, which the row-add event handler has no hook for.
	 */
	const isNew = table.options.meta.newRowUUIDs.includes(uuid);

	// eslint-disable-next-line react-compiler/react-compiler -- table.options.meta is table config, safe to update in effect
	React.useEffect(() => {
		if (isNew) {
			const rowRef = table.options.meta.rowRefs.current.get(uuid);
			if (rowRef && rowRef?.pulseAdd) {
				rowRef.pulseAdd(() => {
					// Create new array instead of mutating
					const currentUUIDs = table.options.meta.newRowUUIDs;
					table.options.meta.newRowUUIDs = currentUUIDs.filter((id) => id !== uuid);
				});
			}
		}
	}, [isNew, table.options.meta, uuid]);

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
