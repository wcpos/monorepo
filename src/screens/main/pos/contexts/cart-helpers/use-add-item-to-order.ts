import * as React from 'react';

import useCollection from '../../../hooks/use-collection';
import { useCurrentOrder } from '../current-order';

export const useAddItemToOrder = () => {
	const { currentOrder, setCurrentOrderID } = useCurrentOrder();
	const { collection } = useCollection('orders');

	/**
	 *
	 */
	const addItemToOrder = React.useCallback(async (type, data) => {
		const order = currentOrder.getLatest();

		// // fee_lines
		// if (order.isNew) {
		// 	const newOrder = await processNewOrder(order, collection, {
		// 		fee_lines: [newFeelLine],
		// 	});
		// 	setCurrentOrderID(newOrder?.uuid);
		// } else {
		// 	await addItem(order, { fee_lines: newFeelLine });
		// }

		// // shipping_lines
		// if (order.isNew) {
		// 	const newOrder = await processNewOrder(order, collection, { shipping_lines: [data] });
		// 	setCurrentOrderID(newOrder?.uuid);
		// } else {
		// 	await addItem(order, { shipping_lines: data });
		// }

		// // product
		// const order = currentOrder.getLatest();

		// if (order.isNew) {
		// 	const newOrder = await processNewOrder(order, collection, {
		// 		line_items: [newLineItem],
		// 	});
		// 	setCurrentOrderID(newOrder?.uuid);
		// } else {
		// 	const populatedLineItems = await order.populate('line_items');
		// 	const existing = populatedLineItems.filter((li) => li.product_id === product.id);
		// 	await processExistingOrder(order, newLineItem, existing);
		// }

		// // variation
		// if (order.isNew) {
		// 	const newOrder = await processNewOrder(order, collection, {
		// 		line_items: [newLineItem],
		// 	});
		// 	setCurrentOrderID(newOrder?.uuid);
		// } else {
		// 	const populatedLineItems = await order.populate('line_items');
		// 	const existing = populatedLineItems.filter((li) => li.variation_id === variation.id);
		// 	await processExistingOrder(order, newLineItem, existing);
		// }

		return true;
	}, []);

	return { addItemToOrder };
};
