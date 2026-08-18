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
	 *
	 */
	return (
		<HStack space="xs" className="justify-center">
			{percent ? (
				<NumberInput
					value={String(amount)}
					onChangeText={(amount) => updateFeeLine(uuid, { amount: String(amount) })}
				/>
			) : (
				<CurrencyInput
					value={String(amount)}
					onChangeText={(amount) => updateFeeLine(uuid, { amount: String(amount) })}
				/>
			)}
			{percent && <Icon name="percent" size="sm" />}
		</HStack>
	);
}
