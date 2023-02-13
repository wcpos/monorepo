import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Icon from '@wcpos/components/src/icon';
import Tabs from '@wcpos/components/src/tabs';

import CartTabTitle from './tab-title';
import useOrders from '../../contexts/orders';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CartTabsProps {
	currentOrder: OrderDocument;
}

/**
 *
 */
const CartTabs = ({ currentOrder }: CartTabsProps) => {
	const navigation = useNavigation();
	const { data: orders } = useOrders();
	const focusedIndex = orders.findIndex((order) => order.uuid === currentOrder.uuid);

	/**
	 *
	 */
	const routes = React.useMemo(() => {
		const r = orders.map((order) => ({
			key: order.uuid,
			title: ({ focused }: { focused: boolean }) => (
				<CartTabTitle focused={focused} order={order} />
			),
		}));

		// add tab for new order
		r.push({
			key: '',
			title: ({ focused }: { focused: boolean }) => (
				<Icon name="plus" type={focused ? 'inverse' : 'primary'} />
			),
		});

		return r;
	}, [orders]);

	/**
	 *
	 */
	const handleTabChange = React.useCallback(
		(idx: number) => {
			/**
			 * @TODO - setParams updates the currentOrder without refreshing the products,
			 * this is great!, but I lose the back button. Push keeps the old order in the stack.
			 */
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
			style={{ paddingBottom: 0, paddingLeft: 0, paddingRight: 0 }}
		/>
	);
};

// export default CartTabs;
export default React.memo(CartTabs);
