import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';

import Icon from '@wcpos/components/src/icon';
import Tabs from '@wcpos/components/src/tabs';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import CartTabTitle from './tab-title';
import useOrders from '../../../../../contexts/orders';
import useCurrentOrder from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

type RenderTabTitle = (focused: boolean, order: OrderDocument) => React.ReactElement;

/**
 *
 */
const CartTabs = () => {
	const navigation = useNavigation();
	const { currentOrder } = useCurrentOrder();
	const { data: orders } = useOrders();
	orders.push({}); // adds an empty tab for the new order
	const focusedIndex = orders.findIndex((order) => order.uuid === currentOrder.uuid);

	/**
	 *
	 */
	const renderTabTitle: RenderTabTitle = React.useCallback(
		(focused, order) =>
			order.uuid ? (
				<CartTabTitle focused={focused} order={order} />
			) : (
				<Icon name="plus" type={focused ? 'inverse' : 'primary'} />
			),
		[]
	);

	/**
	 *
	 */
	const routes = React.useMemo(
		() =>
			orders.map((order) => ({
				key: order.uuid || 'new',
				title: ({ focused }: { focused: boolean }) => renderTabTitle(focused, order),
			})),
		[orders, renderTabTitle]
	);

	/**
	 *
	 */
	const handleTabChange = React.useCallback(
		(idx: number) => {
			/**
			 * @TODO - setParams updates the currentOrder without refreshing the products,
			 * this is great!, but I lose the back button. Push keeps the old order in the stack.
			 */
			navigation.setParams({ orderID: orders[idx].uuid });
			// navigation.dispatch(StackActions.push('POS', { orderID: orders[idx].uuid }));
		},
		[navigation, orders]
	);

	useWhyDidYouUpdate('CartTabs', {
		orders,
		// currentOrder,
		routes,
		// focusedIndex,
		handleTabChange,
		// renderScene,
	});

	/**
	 *
	 */
	return (
		<Tabs.TabBar routes={routes} onIndexChange={handleTabChange} focusedIndex={focusedIndex} />
	);
};

export default CartTabs;
