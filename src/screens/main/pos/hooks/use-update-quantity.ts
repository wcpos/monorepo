import * as React from 'react';

import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export const useUpdateQuantity = () => {
	const { currentOrder } = useCurrentOrder();

	const updateQuantity = React.useCallback(
		async (uuid: string, newQuantity: number) => {
			currentOrder.incrementalModify((order) => {
				const updatedLineItems = order.line_items.map((item) => {
					const uuidMetaData = item.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === uuid) {
						return {
							...item,
							quantity: newQuantity,
							subtotal: String((parseFloat(item.subtotal) / item.quantity) * Number(newQuantity)),
							total: String((parseFloat(item.total) / item.quantity) * Number(newQuantity)),
						};
					}
					return item;
				});

				return { ...order, line_items: updatedLineItems };
			});
		},
		[currentOrder]
	);

	return { updateQuantity };
};
