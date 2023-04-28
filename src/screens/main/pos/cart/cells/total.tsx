import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import NumberInput from '../../../components/number-input';
import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const Total = ({ item, column }: Props) => {
	const total = useObservableState(item.total$, item.total);
	const total_tax = useObservableState(item.total_tax$, item.total_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue) => {
			const quantity = item.getLatest().quantity;
			item.incrementalPatch({
				total: newValue,
				price: parseFloat(newValue) / quantity,
			});
		},
		[item]
	);

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *
	 */
	return (
		<Box space="xSmall" align="end">
			<NumberInput value={total} onChange={handleUpdate} showDecimals />
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`excl. ${format(total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
