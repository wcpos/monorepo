import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import Tabs from '@wcpos/common/src/components/tabs';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Cart from './cart';
import CartTabTitle from './tab-title';
import { usePOSContext } from '../context';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

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
	if (index === -1) {
		setCurrentOrder(orders[0]);
	}

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
		/>
	);
};

export default CartTabs;
