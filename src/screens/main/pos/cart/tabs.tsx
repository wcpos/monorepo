import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';
import { useObservableSuspense } from 'observable-hooks';

import Icon from '@wcpos/components/src/icon';
import Tabs from '@wcpos/components/src/tabs';

import CartTabTitle from './tab-title';
import useOrders from '../../contexts/orders';
import useCurrentOrder from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
const CartTabs = () => {
	const navigation = useNavigation();
	const { currentOrder } = useCurrentOrder();
	const { resource } = useOrders();
	const { data: orders } = useObservableSuspense(resource);
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
			// /**
			//  * TODO - setParams updates the currentOrder without refreshing the products,
			//  * this is great!, but I lose the back button. Push keeps the old order in the stack.
			//  * I need to add the new order to the history without the rerender.
			//  */
			const orderID = routes[idx].key;
			if (orderID !== currentOrder.uuid) {
				navigation.setParams({ orderID });
			}
			// navigation.dispatch(StackActions.push('POS', { orderID: orders[idx].uuid }));
		},
		[currentOrder.uuid, navigation, routes]
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
