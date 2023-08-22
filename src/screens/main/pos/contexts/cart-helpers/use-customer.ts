import * as React from 'react';

import { useCurrentOrder } from '../current-order';

export const useCustomer = () => {
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
		addCustomer,
		removeCustomer,
	};
};
