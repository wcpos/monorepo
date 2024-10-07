import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';

import { EditOrder } from './edit-order';
import Orders from './orders';
import { useCollection } from '../hooks/use-collection';
import { ReceiptModal } from '../receipt';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type OrdersStackParamList = {
	Orders: undefined;
	EditOrder: { orderID: string };
	Receipt: { orderID: string };
};

const Stack = createStackNavigator<OrdersStackParamList>();

/**
 *
 */
const OrdersWithProviders = () => {
	return (
		<ErrorBoundary>
			<Suspense>
				<Orders />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const EditOrderWithProviders = ({
	route,
	navigation,
}: NativeStackScreenProps<OrdersStackParamList, 'EditOrder'>) => {
	const orderID = get(route, ['params', 'orderID']);
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderID);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return (
		<ErrorBoundary>
			<Suspense>
				<EditOrder resource={resource} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const ReceiptWithProviders = ({
	route,
}: NativeStackScreenProps<OrdersStackParamList, 'Receipt'>) => {
	const orderID = get(route, ['params', 'orderID']);
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderID);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return (
		<ErrorBoundary>
			<Suspense>
				<ReceiptModal resource={resource} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const OrdersNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Orders" component={OrdersWithProviders} />
			<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
				<Stack.Screen name="EditOrder" component={EditOrderWithProviders} />
				<Stack.Screen name="Receipt" component={ReceiptWithProviders} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default OrdersNavigator;
