import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';

import NumberInput from '../../../components/number-input';
import { useFeeLineData } from '../../hooks/use-fee-line-data';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine;
	column: import('@wcpos/components/src/table').ColumnProps<FeeLine>;
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
		<Box horizontal align="center" space="xSmall">
			<NumberInput
				value={amount}
				onChange={(amount) => updateFeeLine(uuid, { amount })}
				showDecimals={!percent}
				// showDiscounts={ensureNumberArray(quickDiscounts)}
			/>
			{percent && <Icon name="percent" size="small" />}
		</Box>
	);
};
