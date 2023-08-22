import * as React from 'react';

import { useCurrentOrder } from '../current-order';

/**
 * TODO - remove this, children uuids need to stay on the parent until sync is completed
 * if item has ID we should set it to null so it's deleted on the server
 * else, we can just remove
 */
export const useRemoveItem = () => {
	const { currentOrder } = useCurrentOrder();

	const removeItem = React.useCallback(
		async (item) => {
			const order = currentOrder.getLatest();
			const collection = item.collection.name;
			await order.update({
				$pullAll: {
					[collection]: [item.uuid],
				},
			});
			return item.incrementalRemove();
		},
		[currentOrder]
	);

	return { removeItem };
};
