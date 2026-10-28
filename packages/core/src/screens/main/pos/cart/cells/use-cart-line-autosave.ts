import { wooMetaCarrier } from '@wcpos/sync-core';

import { useRecordAutosave } from '../../../components/use-record-autosave';
import { useCurrentOrder } from '../../contexts/current-order';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';

import type { CartLineChanges } from '../../hooks/use-update-cart-line';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

type Line = Parameters<typeof wooMetaCarrier.lineUuid>[0];

/** A cart line's sheet: each edit is written to the line, in the order the sheet was opened on. */
export function useCartLineAutosave<T extends FieldValues>(
	type: keyof CartLineChanges,
	uuid: string,
	form: UseFormReturn<T>,
	wire?: (root: string, value: unknown) => unknown
) {
	const { updateCartLine } = useUpdateCartLine();
	// The order this sheet belongs to: a debounced write that lands after the sheet closed and
	// another order was selected still reaches it.
	const { currentOrderRecord } = useCurrentOrder();
	return useRecordAutosave<T, Line>({
		form,
		stored: () =>
			(currentOrderRecord.getLatest().payload[type] as Line[] | undefined)?.find(
				(line) => wooMetaCarrier.lineUuid(line) === uuid
			) ?? {},
		persist: (data) =>
			updateCartLine(type, uuid, data as CartLineChanges[typeof type], {
				record: currentOrderRecord,
			}),
		wire,
	});
}
