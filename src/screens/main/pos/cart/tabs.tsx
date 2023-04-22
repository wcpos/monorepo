import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';

import Icon from '@wcpos/components/src/icon';
import Tabs from '@wcpos/components/src/tabs';

import CartTabTitle from './tab-title';
import useOrders from '../../contexts/orders';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CartTabsProps {
	currentOrder: OrderDocument;
	setCurrentOrder: (order?: OrderDocument) => void;
}

/**
 *
 */
const CartTabs = ({ currentOrder }: CartTabsProps) => {
	const navigation = useNavigation();
	const { data: orders } = useOrders();
	const focusedIndex = orders.findIndex((order) => order.uuid === currentOrder.uuid);

	/**
	 * This is a bit hacky, but it works.
	 * This updates the cart to new order after the order is paid
	 */
	// React.useEffect(() => {
	// 	if (focusedIndex === -1 && currentOrder.uuid) {
	// 		setCurrentOrder(null);
	// 	}
	// }, [currentOrder, focusedIndex, setCurrentOrder]);

	/**
	 *
	 */
	const routes = React.useMemo(
		() =>
			orders.map((order) => {
				if (order.isNew) {
					return {
						key: '',
						title: ({ focused }: { focused: boolean }) => (
							<Icon name="plus" type={focused ? 'inverse' : 'primary'} />
						),
					};
				}
				return {
					key: order.uuid,
					title: ({ focused }: { focused: boolean }) => (
						<CartTabTitle focused={focused} order={order} />
					),
				};
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
			navigation.setParams({ orderID: routes[idx].key });
			// navigation.dispatch(StackActions.push('POS', { orderID: orders[idx].uuid }));
		},
		[navigation, routes]
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
