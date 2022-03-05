import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { distinctUntilChanged } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import isEqual from 'lodash/isEqual';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Text from '@wcpos/common/src/components/text';
import Tabs from '@wcpos/common/src/components/tabs';
import Icon from '@wcpos/common/src/components/icon';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Cart from './cart';
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
					const newOrder = storeDB.collections.orders.newDocument({ status: 'pos-open' });
					o.push(newOrder);
					return o;
				}),
				/**
				 * the orderQuery will emit on every change, eg: order total
				 * this causes many unnecessary re-renders
				 * so we compare the previous query with the current query result
				 */
				distinctUntilChanged((prev, curr) => {
					return isEqual(
						prev.map((doc) => doc._id),
						curr.map((doc) => doc._id)
					);
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
	const renderTabTitle: RenderTabTitle = React.useCallback((focused, order) => {
		if (!order?._id) {
			return <Icon name="plus" type={focused ? 'inverse' : 'primary'} />;
		}
		return <Text type={focused ? 'inverse' : 'primary'}>Cart: {order.total}</Text>;
	}, []);

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

	useWhyDidYouUpdate('CartTabs', { orders, currentOrder, routes, orderQuery, index });

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
