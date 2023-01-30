import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

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
	orders.push({}); //
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
			 * this is great!, but I lose the back button. Push refreshes the products.
			 * Can I use StackActions.push('POS', { orderID }) without refreshing the products?
			 */
			navigation.setParams({ orderID: orders[idx].uuid });
		},
		[navigation, orders]
	);

	useWhyDidYouUpdate('CartTabs', {
		orders,
		currentOrder,
		routes,
		focusedIndex,
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
