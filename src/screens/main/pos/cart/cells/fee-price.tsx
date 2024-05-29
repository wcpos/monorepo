import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useFeeLineData } from './use-fee-line-data';
import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import NumberInput from '../../../components/number-input';
import { useTaxCalculator } from '../../../hooks/taxes/use-tax-calculator';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';
import { getMetaDataValueByKey } from '../../hooks/utils';

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
	const t = useT();
	const { getFeeLineData, getFeeLineDisplayPrice } = useFeeLineData();
	const { percent } = getFeeLineData(item);
	const displayPrice = getFeeLineDisplayPrice(item);

	/**
	 *
	 */
	return (
		<>
			<NumberInput
				value={displayPrice}
				onChange={(amount) => updateFeeLine(uuid, { amount })}
				showDecimals={!percent}
				// showDiscounts={ensureNumberArray(quickDiscounts)}
			/>
			{percent && (
				<Text type="textMuted" size="small">
					{t('{percent}% of {total}', { percent: displayPrice, total: '0', _tags: 'core' })}
				</Text>
			)}
		</>
	);
};
