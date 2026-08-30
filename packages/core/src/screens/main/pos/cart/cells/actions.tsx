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
	 * The first press wins: the remove pulse commits `removeLineItem` when it
	 * completes, so a second press must not restart it (wcpos/monorepo#1693).
	 * Latching also stops a double removal, which is not harmless here — the
	 * second call finds no matching uuid and reports a stale cart line to the
	 * cashier.
	 *
	 * A ref rather than state + `disabled`: on Android, removing a Pressable's
	 * `disabled` prop once it has been set does not reliably re-enable the native
	 * view, so a latch that has to be released again must never be expressed as a
	 * `disabled` toggle. A ref also skips the re-render entirely.
	 */
	const removing = React.useRef(false);

	const handleRemoveLineItem = React.useCallback(() => {
		if (removing.current) {
			return;
		}
		const rowRef = meta.rowRefs.current?.get(uuid);
		if (rowRef) {
			removing.current = true;
			rowRef.pulseRemove(() =>
				removeLineItem(uuid, type)
					.catch((error: unknown) => {
						// `localPatch` logs and toasts every failure it handles, and
						// re-raises only ActiveScopeChangedTwiceError, so a rejection
						// getting this far is unexpected. Log it — without a second
						// toast, which would double up on the cashier.
						cartLogger.error('Cart line removal failed', {
							code: ERROR_CODES.CART_UPDATE_FAILED,
							context: { uuid, itemType: type, error: getErrorMessage(error) },
						});
					})
					// Release on settle, not just on rejection: a handled write failure
					// RESOLVES (localPatch swallows it after reporting), so the cell
					// cannot tell from the promise whether the line actually went away.
					// Releasing unconditionally is what keeps a failed removal from
					// leaving the row unremovable for the rest of the session. Double
					// commits are still impossible — pulse-row holds its own latch until
					// this promise settles — and on success the row unmounts, leaving at
					// most one render between settle and unmount.
					.finally(() => {
						removing.current = false;
					})
			);
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
