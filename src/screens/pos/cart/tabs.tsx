import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import Tabs from '@wcpos/components/src/tabs';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import debounce from 'lodash/debounce';
import Cart from './cart';
import EmptyCart from './empty-cart';
import CartTabTitle from './tab-title';
import { usePOSContext } from '../context';

type OrderDocument = import('@wcpos/database').OrderDocument;

type RenderTabTitle = (focused: boolean, order?: OrderDocument) => React.ReactElement;

interface CartTabsProps {
	ordersResource: ObservableResource<OrderDocument[]>;
}

/**
 *
 */
const CartTabs = ({ ordersResource }: CartTabsProps) => {
	const { currentOrder, setCurrentOrder } = usePOSContext();
	const orders = useObservableSuspense(ordersResource);
	const index = orders.findIndex((order) => order === currentOrder);

	/**
	 *
	 */
	React.useEffect(() => {
		if (index === -1) {
			setCurrentOrder(orders[0]);
		}
	}, [index, orders, setCurrentOrder]);

	/**
	 *
	 */
	const renderTabTitle: RenderTabTitle = React.useCallback(
		(focused, order) => <CartTabTitle focused={focused} order={order} />,
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
			if (currentOrder.isCartEmpty('hi')) {
				return <EmptyCart order={currentOrder} />;
			}
			return <Cart order={currentOrder} />;
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

	useWhyDidYouUpdate('CartTabs', { orders, currentOrder, routes, index });

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
