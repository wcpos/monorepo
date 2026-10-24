import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import type { CellContext } from '@wcpos/core/table-types';

import { EditableNumber } from '../../../components/editable-number';
import { useFeeLineData } from '../../hooks/use-fee-line-data';
import { useUpdateCartLine } from '../../hooks/use-update-cart-line';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useNumberFormat } from '../../../hooks/use-number-format';
import { useCartTableReadOnly } from './read-only';

type FeeLine = import('@wcpos/query').OrderFeeLine;
interface Props {
	uuid: string;
	item: FeeLine;
	type: 'line_items';
}

export function FeePrice(props: CellContext<Props, 'price'>) {
	return useCartTableReadOnly() ? <ReadOnlyFeePrice {...props} /> : <EditableFeePrice {...props} />;
}

/** What the fee's input shows: a percentage beside its icon, or the amount. */
function ReadOnlyFeePrice({ row }: CellContext<Props, 'price'>) {
	const { getFeeLineData } = useFeeLineData();
	const { percent, amount } = getFeeLineData(row.original.item);
	const { format } = useCurrentOrderCurrencyFormat();
	// The store's separators, as the percentage input shows them (`12,5`, not `12.5`).
	const { format: formatNumber } = useNumberFormat();
	return (
		<HStack space="xs" className="justify-center">
			<Text className="text-muted-foreground text-right tabular-nums">
				{percent ? formatNumber(Number(amount) || 0) : format(Number(amount) || 0)}
			</Text>
			{percent && <Icon name="percent" size="sm" />}
		</HStack>
	);
}

function EditableFeePrice({ row }: CellContext<Props, 'price'>) {
	const { item, uuid } = row.original;
	const { updateCartLine } = useUpdateCartLine();
	const { getFeeLineData } = useFeeLineData();
	const { percent, amount } = getFeeLineData(item);
	const { format } = useCurrentOrderCurrencyFormat();
	const { format: formatNumber } = useNumberFormat();

	/**
	 * The till no longer accepts a NEW negative fee, but historical orders still carry
	 * them and this cell renders them. A negative value is therefore IGNORED rather than
	 * clamped: the input re-emits its current value on blur, and clamping would have
	 * turned "focus and leave" on a legacy discount fee into a silent rewrite to zero.
	 */
	const onAmount = (next: number) => {
		if (next < 0) return;
		void updateCartLine('fee_lines', uuid, { amount: String(next) });
	};

	return (
		// The editor takes the cell beside the icon, so its field is the column's width.
		<HStack space="xs" className="items-center self-stretch">
			<View className="min-w-0 flex-1">
				<EditableNumber
					testID="cart-fee-price"
					value={String(amount)}
					display={percent ? formatNumber(Number(amount) || 0) : format(Number(amount) || 0)}
					formatOptions={percent ? undefined : { fixedDecimalScale: true }}
					textClassName="text-muted-foreground text-right"
					onChangeText={onAmount}
				/>
			</View>
			{percent && <Icon name="percent" size="sm" />}
		</HStack>
	);
}
