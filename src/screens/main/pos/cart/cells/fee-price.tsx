import * as React from 'react';

import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';

import NumberInput from '../../../components/number-input';
import { useFeeLineData } from '../../hooks/use-fee-line-data';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

import type { CellContext } from '@tanstack/react-table';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine;
	type: 'line_items';
}

/**
 *
 */
export const FeePrice = ({ row }: CellContext<Props, 'price'>) => {
	const { item, uuid } = row.original;
	const { updateFeeLine } = useUpdateFeeLine();
	const { getFeeLineData } = useFeeLineData();
	const { percent, amount } = getFeeLineData(item);

	/**
	 *
	 */
	return (
		<HStack space="xs" className="justify-center">
			<NumberInput
				value={amount}
				onChange={(amount) => updateFeeLine(uuid, { amount })}
				showDecimals={!percent}
				// showDiscounts={ensureNumberArray(quickDiscounts)}
			/>
			{percent && <Icon name="percent" size="sm" />}
		</HStack>
	);
};
