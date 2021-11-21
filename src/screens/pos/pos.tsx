import * as React from 'react';
import { View, Text, PanResponderGestureState, LayoutChangeEvent } from 'react-native';
import { useObservable, useObservableState, useObservableSuspense } from 'observable-hooks';
import { from, of } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
// import { PanGestureHandler } from 'react-native-gesture-handler';
// import { useAnimatedGestureHandler, useSharedValue } from 'react-native-reanimated';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
// import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useUIResource from '@wcpos/common/src/hooks/use-ui';
import { QueryProvider } from '@wcpos/common/src/hooks/use-query';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import Draggable from '@wcpos/common/src/components/draggable';
import Gutter from '@wcpos/common/src/components/gutter';
import useOnLayout from '@wcpos/common/src/hooks/use-on-layout';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import clamp from 'lodash/clamp';
import Cart from './cart';
import Products from './products';
import Checkout from './checkout';
import ResizeableColumns from './resizable-columns';
import * as Styled from './styles';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface POSContextProps {
	currentOrder?: OrderDocument;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	currentCustomer?: CustomerDocument;
	setCurrentCustomer: React.Dispatch<React.SetStateAction<CustomerDocument | undefined>>;
}

export const POSContext = React.createContext<POSContextProps>({
	currentOrder: undefined,
	// @ts-ignore
	setCurrentOrder: undefined,
	currentCustomer: undefined,
	// @ts-ignore
	setCurrentCustomer: undefined,
});

/**
 *
 */
const POS = () => {
	const { storeDB } = useAppState();
	const resources = useUIResource();
	const productsUI = useObservableSuspense(resources.posProducts);
	const cartUI = useObservableSuspense(resources.cart);
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | undefined>();
	const [currentCustomer, setCurrentCustomer] = React.useState<CustomerDocument | undefined>();

	const orderQuery = storeDB.collections.orders.find().where('status').eq('pos-open');

	const orders: OrderDocument[] = useObservableState(
		orderQuery.$.pipe(
			filter((o) => {
				/** @TODO - remove this hack!
				 * why is orderQuery emitting on changes to order.lineItems??
				 */
				return orders?.length !== o.length;
			})
		),
		[]
	);

	const context = React.useMemo(
		() => ({ currentOrder, setCurrentOrder, currentCustomer, setCurrentCustomer }),
		[currentCustomer, currentOrder]
	);

	return (
		<POSContext.Provider value={context}>
			<ResizeableColumns
				ui={productsUI}
				leftComponent={
					<ErrorBoundary>
						<QueryProvider initialQuery={{ sortBy: 'name', sortDirection: 'asc' }}>
							<Products ui={productsUI} />
						</QueryProvider>
					</ErrorBoundary>
				}
				rightComponent={
					currentOrder && currentOrder.status === 'pos-checkout' ? (
						<Checkout />
					) : (
						<ErrorBoundary>
							<Cart ui={cartUI} orders={orders} />
						</ErrorBoundary>
					)
				}
			/>
		</POSContext.Provider>
	);
};

export default POS;
