import * as React from 'react';

import { getDateCreated } from './utils';
import { useCollection } from '../../../../hooks/use-collection';
import { useCurrentOrder } from '../contexts/current-order';

export const useAddItemToOrder = () => {
	const { currentOrder, setCurrentOrderID } = useCurrentOrder();
	const { collection } = useCollection('orders');

	/**
	 *
	 */
	const saveNewOrder = React.useCallback(
		async (type: 'line_items' | 'fee_lines' | 'shipping_lines', data: object) => {
			const order = currentOrder.getLatest();

			const orderJSON = {
				...order.toJSON(),
				...getDateCreated(),
				[type]: [data],
			};

			order.remove();

			const newOrder = await collection.insert(orderJSON);
			setCurrentOrderID(newOrder?.uuid);
		},
		[collection, currentOrder, setCurrentOrderID]
	);

	/**
	 * NOTE: If I don't include getLatest(), the populate() will return old data
	 */
	const addItemToOrder = React.useCallback(
		async (type, data) => {
			const order = currentOrder.getLatest();

			if (order.isNew) {
				return saveNewOrder(type, data);
			}

			// if line item, check it an item with the same product_id already exists
			if (type === 'line_items') {
				const populatedLineItems = await order.populate('line_items');
				let existing = [];
				if (data.variation_id) {
					existing = populatedLineItems.filter((li) => li.variation_id === data.variation_id);
				} else {
					existing = populatedLineItems.filter((li) => li.product_id === data.product_id);
				}

				// if item already in cart
				if (existing.length === 1) {
					const item = existing[0];
					const current = item.getLatest();
					const currentQuantity = current.quantity;
					const currentSubtotal = current.subtotal;
					const currentTotal = current.total;
					const newValue = currentQuantity + 1;
					await item.incrementalPatch({
						quantity: Number(newValue),
						subtotal: String((parseFloat(currentSubtotal) / currentQuantity) * Number(newValue)),
						total: String((parseFloat(currentTotal) / currentQuantity) * Number(newValue)),
					});

					return order;
				}
			}

			// default: add line item type
			return order.incrementalUpdate({
				$push: {
					[type]: data,
				},
			});
		},
		[currentOrder, saveNewOrder]
	);

	return { addItemToOrder };
};
