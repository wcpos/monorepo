import * as React from 'react';
import Tabs from '@wcpos/components/src/tabs';
import Text from '@wcpos/components/src/text';
import Icon from '@wcpos/components/src/icon';
import useTimeout from '@wcpos/hooks/src/use-timeout';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import useOrders from '@wcpos/core/src/contexts/orders';
import Cart from './cart';
import EmptyCart from './empty-cart';
import CartTabTitle from './tab-title';
import { usePOSContext } from '../context';
import useNewOrder from './use-new-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

type RenderTabTitle = (focused: boolean, order?: OrderDocument) => React.ReactElement;

/**
 *
 */
const CartTabs = () => {
	const { currentOrder, setCurrentOrder } = usePOSContext();
	const { data: orders } = useOrders();
	const newOrder = useNewOrder();
	orders.push(newOrder);
	const index = orders.findIndex((order) => order === currentOrder);

	/**
	 * In cases where the current order is not found, set the currentOrder = first order
	 * Note: this happens when a newOrder is created, the query takes longer to come back
	 * @TODO: this is fragile, what happens if query takes longer than 100ms?
	 */
	useTimeout(() => index === -1 && setCurrentOrder(orders[0]), 100);

	/**
	 *
	 */
	const renderTabTitle: RenderTabTitle = React.useCallback(
		(focused, order) =>
			order._id ? (
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
	const renderScene = React.useCallback(
		({ route }: { route: typeof routes[number] }) => {
			if (!route || !currentOrder) {
				return null;
			}
			if (currentOrder.isCartEmpty()) {
				return (
					<React.Suspense fallback={<Text>Loading Empty Cart</Text>}>
						<EmptyCart order={currentOrder} />
					</React.Suspense>
				);
			}
			return (
				<React.Suspense fallback={<Text>Loading Cart</Text>}>
					<Cart order={currentOrder} />
				</React.Suspense>
			);
		},
		[currentOrder]
	);

	/**
	 *
	 */
	const handleTabChange = React.useCallback(
		(idx: number) => {
			setCurrentOrder(orders[idx]);
		},
		[orders, setCurrentOrder]
	);

	useWhyDidYouUpdate('CartTabs', {
		orders,
		currentOrder,
		routes,
		index,
		handleTabChange,
		renderScene,
	});

	/**
	 *
	 */
	return (
		<Tabs<typeof routes[number]>
			onIndexChange={handleTabChange}
			navigationState={{ index, routes }}
			renderScene={renderScene}
			tabBarPosition="bottom"
			style={{ height: '100%' }}
		/>
	);
};

export default CartTabs;
