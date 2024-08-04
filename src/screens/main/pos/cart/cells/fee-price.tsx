import * as React from 'react';

import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';

import NumberInput from '../../../components/number-input';
import { useFeeLineData } from '../../hooks/use-fee-line-data';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine;
	column: import('@wcpos/tailwind/src/table').ColumnProps<FeeLine>;
}

/**
 *
 */
export const FeePrice = ({ uuid, item, column }: Props) => {
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
