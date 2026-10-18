import * as React from 'react';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';
import { NumberInput } from '../../../components/number-input';
import { useNumberFormat } from '../../../hooks/use-number-format';
import { lineRef, useCartUnmet } from '../../conditions/use-cart-conditions';
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
	const { format } = useNumberFormat();
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
	const t = useT();
	const overStock = useCartUnmet().some((condition) => condition.lineUuid === uuid);
	const focusRef = React.useMemo(
		() => lineRef(uuid, 'openQuantity', (input: { focus: () => void }) => input.focus()),
		[uuid]
	);
	return (
		<VStack className="min-h-row items-center justify-center gap-1">
			<NumberInput
				testID="cart-quantity-input"
				ref={focusRef}
				// The column is 56 wide and the input box 41; the shared input's 12-point
				// horizontal padding left ~17 points for the digits, so "19" fit and "20"
				// painted as "2" (iPhone 16 Pro simulator, 2026-09-09). Native only; the
				// web NumberInput renders a button and ignores this.
				inputClassName="border-0 px-1 text-center tabular-nums"
				// `web:px-2` only: the native Input already pads its field (px-1 above), and a
				// second padding on the 36-point box clipped two-digit quantities.
				className={cn(
					'web:px-2 h-9 min-w-9 items-center justify-center tabular-nums',
					overStock && 'border-attention bg-attention/15'
				)}
				textClassName="font-semibold"
				// A tap on the field lands the caret wherever the finger was, often before
				// the digits, so typing appends instead of replacing ("1" → "31"). A
				// cashier tapping the quantity means to replace it, as the web numpad
				// does; selecting on focus makes the next keystroke do exactly that.
				selectTextOnFocus
				value={item.quantity}
				onChangeText={(quantity) => updateCartLine('line_items', uuid, { quantity })}
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
