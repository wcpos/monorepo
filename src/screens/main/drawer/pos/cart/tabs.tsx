import * as React from 'react';

import { useRoute, useNavigation } from '@react-navigation/native';

import Icon from '@wcpos/components/src/icon';
import Tabs from '@wcpos/components/src/tabs';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import CartTabTitle from './tab-title';
import useOrders from '../../../../../contexts/orders';
import useCurrentOrder from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

type RenderTabTitle = (focused: boolean, order?: OrderDocument) => React.ReactElement;

/**
 *
 */
const CartTabs = () => {
	const navigation = useNavigation();
	const { currentOrder, setCurrentOrder, newOrder } = useCurrentOrder();
	const { data } = useOrders();
	const orders = React.useMemo(() => [...data, newOrder], [data, newOrder]);
	const focusedIndex = orders.findIndex((order) => order === currentOrder);

	/**
	 *
	 */
	React.useEffect(() => {
		if (focusedIndex === -1) {
			setCurrentOrder(orders[0]);
		}
	}, [focusedIndex, orders, setCurrentOrder]);

	/**
	 * In cases where the current order is not found, set the currentOrder = first order
	 * Note: this happens when a newOrder is created, the query takes longer to come back
	 * @TODO: this is fragile, what happens if query takes longer than 100ms?
	 */
	// useTimeout(() => focusedIndex === -1 && setCurrentOrder(orders[0]), 100);

	/**
	 *
	 */
	const renderTabTitle: RenderTabTitle = React.useCallback(
		(focused, order) =>
			order?._id ? (
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
				key: order?._id || 0,
				title: ({ focused }: { focused: boolean }) => renderTabTitle(focused, order),
			})),
		[orders, renderTabTitle]
	);

	/**
	 *
	 */
	const handleTabChange = React.useCallback(
		(idx: number) => {
			navigation.navigate('POS', { orderID: orders[idx]?._id });
			// setCurrentOrder(orders[idx]);
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
