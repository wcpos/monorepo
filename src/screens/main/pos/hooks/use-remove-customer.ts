import * as React from 'react';

import { useCurrentOrder } from '../contexts/current-order';

export const useRemoveCustomer = () => {
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const removeCustomer = React.useCallback(async () => {
		const order = currentOrder.getLatest();
		return order.patch({
			customer_id: -1,
			billing: {},
			shipping: {},
		});
	}, [currentOrder]);

	return {
		removeCustomer,
	};
};
