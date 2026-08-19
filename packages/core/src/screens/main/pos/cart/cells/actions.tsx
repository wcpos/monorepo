import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import type { CellContext } from '@wcpos/core/table-types';

import { useRemoveLineItem } from '../../hooks/use-remove-line-item';

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
		const rowRef = meta.rowRefs.current?.get(uuid);
		if (rowRef) {
			rowRef.pulseRemove(() => {
				void removeLineItem(uuid, type);
			});
		}
		// meta.rowRefs is a stable ref; its `.current` is read at call time, so it
		// is intentionally not a dependency.
	}, [removeLineItem, type, uuid]);

	/**
	 * Add-pulses are triggered by the cart table's detection effect (which owns
	 * rowRefs); this cell only handles the remove flow.
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
