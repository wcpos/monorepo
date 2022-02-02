import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { map, tap } from 'rxjs/operators';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Text from '@wcpos/common/src/components/text';
import Tabs from '@wcpos/common/src/components/tabs';
import Icon from '@wcpos/common/src/components/icon';
import Cart from './cart';
import EmptyCart from './empty-cart';
import { usePOSContext } from '../context';

type RenderTabTitle = (
	focused: boolean,
	order?: import('@wcpos/common/src/database').OrderDocument
) => React.ReactElement;

/**
 *
 */
const CartTabs = () => {
	const { storeDB } = useAppState();
	const { currentOrder, setCurrentOrder } = usePOSContext();
	const orderQuery = storeDB.collections.orders.find().where('status').eq('pos-open');
	const [orders] = useObservableState(
		() =>
			orderQuery.$.pipe(
				map((o) => {
					o.push(storeDB.collections.orders.newDocument({ status: 'pos-open' }));
					return o;
				})
			),
		[]
	);
	const index = orders.findIndex((order) => order === currentOrder);

	/**
	 *
	 */
	React.useEffect(() => {
		if (!currentOrder && orders.length > 0) {
			setCurrentOrder(orders[0]);
		}
	}, [currentOrder, orders, setCurrentOrder]);

	/**
	 *
	 */
	const renderTabTitle: RenderTabTitle = (focused, order) => {
		if (!order?.localID) {
			return <Icon name="plus" type={focused ? 'inverse' : 'primary'} />;
		}
		return <Text type={focused ? 'inverse' : 'primary'}>Cart: {order.total}</Text>;
	};

	/**
	 *
	 */
	const routes = orders.map((order) => ({
		key: order?.localID || 0,
		title: ({ focused }: { focused: boolean }) => renderTabTitle(focused, order),
	}));

	/**
	 *
	 */
	const renderScene = ({ route }: { route: typeof routes[number] }) => {
		if (!route || !currentOrder) {
			return null;
		}
		return null;
		// return <Cart order={currentOrder} />;
	};

	/**
	 *
	 */
	const handleTabChange = (idx: number) => {
		setCurrentOrder(orders[idx]);
	};

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
