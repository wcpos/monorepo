import * as React from 'react';

import { useCurrentOrder } from '../contexts/current-order';

export const useAddCustomer = () => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const addCustomer = React.useCallback(
		async (data) => {
			const order = currentOrder.getLatest();
			return order.patch(data);
		},
		[currentOrder]
	);

	return {
		addCustomer,
	};
};
