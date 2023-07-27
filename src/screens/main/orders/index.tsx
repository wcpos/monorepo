import * as React from 'react';

import { StackActions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';

import EditOrder from './edit-order';
import Orders from './orders';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { OrdersProvider } from '../contexts/orders';
import useCollection from '../hooks/use-collection';
import Receipt from '../receipt';

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

	const resource = React.useMemo(
		() => new ObservableResource(from(collection.findOneFix(orderID).exec())),
		[collection, orderID]
	);

	return (
		<ModalLayout
			title={t('Edit Order', { _tags: 'core' })}
			primaryAction={{ label: t('Save to Server', { _tags: 'core' }) }}
			secondaryActions={[
				{
					label: t('Cancel', { _tags: 'core' }),
					action: () => navigation.dispatch(StackActions.pop(1)),
				},
			]}
		>
			<Suspense>
				<EditOrder resource={resource} />
			</Suspense>
		</ModalLayout>
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

	const resource = React.useMemo(
		() => new ObservableResource(from(collection.findOneFix(orderID).exec())),
		[collection, orderID]
	);

	return (
		<ModalLayout
			title={t('Receipt', { _tags: 'core' })}
			primaryAction={{
				label: t('Print Receipt', { _tags: 'core' }),
			}}
			secondaryActions={[
				{
					label: t('Email Receipt', { _tags: 'core' }),
				},
			]}
			style={{ height: '100%' }}
		>
			<Suspense>
				<Receipt resource={resource} />
			</Suspense>
		</ModalLayout>
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
