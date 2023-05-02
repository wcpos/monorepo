import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 *
 */
export const Price = ({ item }: Props) => {
	const price = useObservableState(item.price$, item.price);

	/**
	 * update subtotal, not price
	 */
	const handleUpdate = React.useCallback(
		(newValue: string) => {
			const quantity = item.getLatest().quantity;
			const newTotal = String(quantity * parseFloat(newValue));
			item.incrementalPatch({ price: parseFloat(newValue), total: newTotal });
		},
		[item]
	);

	/**
	 *
	 */
	return <NumberInput value={String(price)} onChange={handleUpdate} showDecimals />;
};
