import * as React from 'react';

import { useAddItemToOrder } from './use-add-item-to-order';

/**
 *
 */
export const useAddShipping = () => {
	const { addItemToOrder } = useAddItemToOrder();
	/**
	 *
	 */
	const addShipping = React.useCallback(
		async (data) => {
			await addItemToOrder('shipping_lines', data);
		},
		[addItemToOrder]
	);

	return { addShipping };
};
