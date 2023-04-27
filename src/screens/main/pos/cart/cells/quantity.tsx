import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import NumberInput from '../../../components/number-input';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

export const Quantity = ({ item }: Props) => {
	const quantity = useObservableState(item.quantity$, item.quantity);

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue) => {
			const current = item.getLatest();
			const currentQuantity = current.quantity;
			const currentSubtotal = current.subtotal;
			const currentTotal = current.total;
			item.incrementalPatch({
				quantity: Number(newValue),
				subtotal: String((parseFloat(currentSubtotal) / currentQuantity) * Number(newValue)),
				total: String((parseFloat(currentTotal) / currentQuantity) * Number(newValue)),
			});
		},
		[item]
	);

	/**
	 *
	 */
	return <NumberInput value={String(quantity)} onChange={handleUpdate} />;
};
