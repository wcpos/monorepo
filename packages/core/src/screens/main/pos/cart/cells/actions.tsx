import * as React from 'react';

import { IconButton } from '@wcpos/components/icon-button';
import type { CellContext } from '@wcpos/core/table-types';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useRemoveLineItem } from '../../hooks/use-remove-line-item';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'remove']);

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
	 * Every press is forwarded; `pulseRemove` owns the re-entrancy guard
	 * (wcpos/monorepo#1693). Repeat presses are no-ops there while a pulse is in
	 * flight, and its latch is held until the committed removal settles, so a
	 * second latch here would guard nothing — and it could not be released
	 * correctly: a quantity change on this line makes the cart table fire
	 * `pulseAdd()` for the same uuid, cancelling the remove pulse so the callback
	 * below never runs. A cell-level latch would then stay set forever and the
	 * line would be unremovable. One owner for the guard, and it is the one that
	 * can see the cancellation.
	 */
	const handleRemoveLineItem = () => {
		const rowRef = meta.rowRefs.current?.get(uuid);
		if (rowRef) {
			rowRef.pulseRemove(() =>
				removeLineItem(uuid, type).catch((error: unknown) => {
					// `localPatch` logs and toasts every failure it handles, and re-raises
					// only ActiveScopeChangedTwiceError, so a rejection getting this far
					// is unexpected. Log it — without a second toast, which would double
					// up on the cashier.
					cartLogger.error('Cart line removal failed', {
						code: ERROR_CODES.CART_UPDATE_FAILED,
						context: { uuid, itemType: type, error: getErrorMessage(error) },
					});
				})
			);
		}
	};

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
