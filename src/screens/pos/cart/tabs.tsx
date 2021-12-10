import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useObservableState } from 'observable-hooks';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Text from '@wcpos/common/src/components/text';
import Tabs from '@wcpos/common/src/components/tabs';
import Cart from './cart';
import EmptyCart from './empty-cart';

const CartTabs = () => {
	const { storeDB } = useAppState();
	const orderQuery = storeDB.collections.orders.find().where('status').eq('pos-open');
	const orders = useObservableState(orderQuery.$, []);
	const [index, setIndex] = React.useState(0);

	const renderTabTitle = (order, focused) => {
		return <Text type={focused ? 'inverse' : 'primary'}>Cart: {order.total}</Text>;
	};

	const routes = orders.map((order) => ({
		key: order.id,
		title: ({ focused }) => renderTabTitle(order, focused),
	}));

	routes.push({
		key: 0,
		title: 'New',
	});

	const renderScene = ({ route }: { route: typeof routes[number] }) => {
		if (route.key === 0) {
			return <EmptyCart />;
		}

		return <Cart order={orders[index]} />;
	};

	return (
		<Tabs<typeof routes[number]>
			onIndexChange={setIndex}
			navigationState={{ index, routes }}
			renderScene={renderScene}
			tabBarPosition="bottom"
		/>
	);
};

export default CartTabs;
