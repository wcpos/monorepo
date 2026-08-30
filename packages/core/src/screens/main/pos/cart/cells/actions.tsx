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

	/**
	 * The first press wins: the remove pulse commits `removeLineItem` when it
	 * completes, so a second press must not restart it (wcpos/monorepo#1693).
	 * Latching also stops a double removal, which is not harmless here — the
	 * second call finds no matching uuid and reports a stale cart line to the
	 * cashier. The row unmounts once the removal lands, and `disabled` is only
	 * ever set and never cleared, so the Android disabled-prop-removal latch
	 * does not apply.
	 */
	const [removing, setRemoving] = React.useState(false);

	const handleRemoveLineItem = React.useCallback(() => {
		if (removing) {
			return;
		}
		const rowRef = meta.rowRefs.current?.get(uuid);
		if (rowRef) {
			setRemoving(true);
			rowRef.pulseRemove(() => {
				void removeLineItem(uuid, type);
			});
		}
		// meta.rowRefs is a stable ref; its `.current` is read at call time, so it
		// is intentionally not a dependency.
	}, [removeLineItem, removing, type, uuid]);

	/**
	 * Add-pulses are triggered by the cart table's detection effect (which owns
	 * rowRefs); this cell only handles the remove flow.
	 */
	return (
		<IconButton
			name="circleXmark"
			variant="destructive"
			size="4xl"
			disabled={removing}
			onPress={handleRemoveLineItem}
		/>
	);
}
