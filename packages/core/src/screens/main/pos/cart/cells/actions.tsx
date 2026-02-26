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

export function Actions({ row, table }: CellContext<Props, 'actions'>) {
	const { uuid, type } = row.original;
	const { removeLineItem } = useRemoveLineItem();

	/**
	 *
	 */
	const meta = table.options.meta!;

	const handleRemoveLineItem = React.useCallback(() => {
		const rowRef = (meta.rowRefs.current as unknown as Map<string, Record<string, unknown>>).get(
			uuid
		);
		if (rowRef && rowRef?.pulseRemove) {
			(rowRef.pulseRemove as (cb: () => void) => void)(() => {
				removeLineItem(uuid, type);
			});
		}
	}, [removeLineItem, meta.rowRefs, type, uuid]);

	/**
	 * Use pulse effect for new rows.
	 *
	 * useEffect is needed here because rowRef.pulseAdd() runs its callback after
	 * the ~800ms animation completes. Cleanup of table.options.meta.newRowUUIDs
	 * must happen at that point, which the row-add event handler has no hook for.
	 */
	const isNew = meta.newRowUUIDs.includes(uuid);

	React.useEffect(() => {
		if (isNew) {
			const rowRef = (meta.rowRefs.current as unknown as Map<string, Record<string, unknown>>).get(
				uuid
			);
			if (rowRef && rowRef?.pulseAdd) {
				(rowRef.pulseAdd as (cb: () => void) => void)(() => {
					meta.removeNewRowUUID(uuid);
				});
			}
		}
	}, [isNew, meta, uuid]);

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
}
