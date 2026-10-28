import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';
import { AmountField } from '../../../components/amount-field';
import { QUANTITY_FORMAT, useNumberFormat } from '../../../hooks/use-number-format';
import { lineRef, useCartUnmet } from '../../conditions/use-cart-conditions';
import { useRemoveLineItem } from '../../hooks/use-remove-line-item';
import { useSplitLineItem } from '../../hooks/use-split-line-item';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';
import { readOnlyLineKey, readOnlyTestID, useCartTableReadOnly } from './read-only';
type LineItem = import('@wcpos/query').OrderLineItem;
interface Props {
	uuid: string;
	item: LineItem;
	type: 'line_items';
}
export function Quantity(props: CellContext<Props, 'quantity'>) {
	return useCartTableReadOnly() ? <ReadOnlyQuantity {...props} /> : <EditableQuantity {...props} />;
}

/** The quantity as the input shows it, centred in the same cell, with nothing to press. */
function ReadOnlyQuantity({ row }: CellContext<Props, 'quantity'>) {
	const { item, uuid } = row.original;
	// The store's separators, as the quantity input shows a fractional quantity.
	const { format } = useNumberFormat(QUANTITY_FORMAT);
	return (
		<VStack className="min-h-row items-center justify-center">
			<Text
				testID={readOnlyTestID('qty', readOnlyLineKey(uuid, item))}
				className="text-center font-semibold tabular-nums"
			>
				{format(item.quantity ?? 1)}
			</Text>
		</VStack>
	);
}

function EditableQuantity({ row, column }: CellContext<Props, 'quantity'>) {
	const { item, uuid } = row.original;
	const { updateCartLine } = useUpdateCartLine();
	const { splitLineItem } = useSplitLineItem();
	const { removeLineItem } = useRemoveLineItem();
	const t = useT();
	const overStock = useCartUnmet().some((condition) => condition.lineUuid === uuid);
	const focusRef = React.useMemo(
		() => lineRef(uuid, 'openQuantity', (input: { focus: () => void }) => input.focus()),
		[uuid]
	);
	return (
		<VStack className="min-h-row items-center justify-center gap-1">
			<AmountField
				kind="quantity"
				testID="cart-quantity-input"
				ref={focusRef}
				// The column is 56 wide and the input box 41; the shared input's 12-point
				// horizontal padding left ~17 points for the digits, so "19" fit and "20"
				// painted as "2" (iPhone 16 Pro simulator, 2026-09-09): the number pads 4
				// itself, and on web the box pads 4 more around it.
				className="web:px-1 min-w-9 items-center justify-center"
				textClassName="px-1 text-center font-semibold"
				tone={overStock ? 'attention' : undefined}
				value={item.quantity}
				// Web: whether the store took it (a refusal, the stock guard's, is presented by
				// the queue and resolves `false`), so the keypad's − and + can take it back.
				onCommit={(quantity) =>
					updateCartLine('line_items', uuid, { quantity }).then((result) => result !== false)
				}
				// − at 1 (web) or a typed 0 is the cart's own remove (and its Undo toast), as the
				// conditions notice calls it.
				onRemove={() => void removeLineItem(uuid, 'line_items')}
			/>
			{column.columnDef.meta?.show?.('split') && (item.quantity ?? 0) > 1 && (
				<Text
					testID="cart-line-split"
					variant="link"
					className="text-primary text-sm"
					onPress={() => splitLineItem(uuid)}
				>
					{t('pos_cart.split_qty')}
				</Text>
			)}
		</VStack>
	);
}
