import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const Total = ({ item }: Props) => {
	const total = useObservableState(item.total$, item.total);

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
	return <NumberInput value={total} onChange={handleUpdate} showDecimals />;
};
