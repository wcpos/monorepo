import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Tabs from '@wcpos/components/src/tabs';

import CartTabTitle from './tab-title';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
const CartTabs = ({ query }) => {
	const { currentOrder, setCurrentOrderID } = useCurrentOrder();
	const orders = useObservableSuspense(query.resource);
	const focusedIndex = orders.findIndex((order) => order.uuid === currentOrder.uuid);

	/**
	 * Create routes for each order, plus a new order route
	 */
	const routes = React.useMemo(
		() =>
			orders
				.map((order) => ({
					key: order.uuid,
					title: ({ focused }: { focused: boolean }) => (
						<CartTabTitle focused={focused} order={order} />
					),
				}))
				.concat({
					key: '',
					title: ({ focused }: { focused: boolean }) => (
						<Icon name="plus" type={focused ? 'inverse' : 'primary'} />
					),
				}),
		[orders]
	);

	/**
	 *
	 */
	const handleTabChange = React.useCallback(
		(idx: number) => {
			const newOrderID = routes[idx].key;
			if (newOrderID !== currentOrder.uuid) {
				setCurrentOrderID(newOrderID);
			}
		},
		[currentOrder.uuid, routes, setCurrentOrderID]
	);

	/**
	 *
	 */
	return (
		<Tabs.TabBar
			routes={routes}
			onIndexChange={handleTabChange}
			focusedIndex={focusedIndex === -1 ? orders.length : focusedIndex}
			style={{ paddingBottom: 0, paddingLeft: 0 }}
		/>
	);
};

export default CartTabs;
// export default React.memo(CartTabs);
