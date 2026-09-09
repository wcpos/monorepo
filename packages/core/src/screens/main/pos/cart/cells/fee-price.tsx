import * as React from 'react';

import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import type { CellContext } from '@wcpos/core/table-types';

import { CurrencyInput } from '../../../components/currency-input';
import { NumberInput } from '../../../components/number-input';
import { useFeeLineData } from '../../hooks/use-fee-line-data';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

type FeeLine = NonNullable<import('@wcpos/database').OrderDocument['fee_lines']>[number];
interface Props {
	uuid: string;
	item: FeeLine;
	type: 'line_items';
}

/**
 *
 */
export function FeePrice({ row }: CellContext<Props, 'price'>) {
	const { item, uuid } = row.original;
	const { updateFeeLine } = useUpdateFeeLine();
	const { getFeeLineData } = useFeeLineData();
	const { percent, amount } = getFeeLineData(item);

	/**
	 * The till no longer accepts a NEW negative fee, but historical orders still carry
	 * them and this cell renders them. A negative value is therefore IGNORED rather than
	 * clamped: the input re-emits its current value on blur, and clamping would have
	 * turned "focus and leave" on a legacy discount fee into a silent rewrite to zero.
	 */
	const onAmount = (next: number) => {
		if (next < 0) return;
		void updateFeeLine(uuid, { amount: String(next) });
	};

	return (
		<HStack space="xs" className="justify-center">
			{percent ? (
				<NumberInput value={String(amount)} onChangeText={onAmount} />
			) : (
				<CurrencyInput value={String(amount)} onChangeText={onAmount} />
			)}
			{percent && <Icon name="percent" size="sm" />}
		</HStack>
	);
}
