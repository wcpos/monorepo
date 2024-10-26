import * as React from 'react';

import { v4 as uuidv4 } from 'uuid';

import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { useCollection } from '../../hooks/use-collection';
import { useCurrentOrder } from '../contexts/current-order';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
type CartLine = LineItem | FeeLine | ShippingLine;
type CartLineType = 'line_items' | 'fee_lines' | 'shipping_lines';

export const useAddItemToOrder = () => {
	const { currentOrder, setCurrentOrderID } = useCurrentOrder();
	const { collection } = useCollection('orders');

	/**
	 *
	 */
	const saveNewOrder = React.useCallback(
		async (type: CartLineType, data: CartLine) => {
			const order = currentOrder.getLatest();

			const orderJSON = {
				...order.toJSON(),
				date_created_gmt: convertLocalDateToUTCString(new Date()),
				[type]: [data],
			};

			order.remove();

			const newOrder = await collection.insert(orderJSON);
			setCurrentOrderID(newOrder?.uuid);
			return newOrder;
		},
		[collection, currentOrder, setCurrentOrderID]
	);

	/**
	 * NOTE: If I don't include getLatest(), the populate() will return old data
	 */
	const addItemToOrder = React.useCallback(
		async (type: CartLineType, data: CartLine) => {
			const order = currentOrder.getLatest();

			// make sure items have a uuid before saving
			data.meta_data = data.meta_data || [];
			const meta = data.meta_data.find((meta: any) => meta.key === '_woocommerce_pos_uuid');
			const metaUUID = meta && meta.value;

			if (!metaUUID) {
				data.meta_data.push({
					key: '_woocommerce_pos_uuid',
					value: uuidv4(),
				});
			}

			if (order.isNew) {
				return saveNewOrder(type, data);
			} else {
				return order.incrementalUpdate({
					$push: {
						[type]: data,
					},
				});
			}
		},
		[currentOrder, saveNewOrder]
	);

	return { addItemToOrder };
};
