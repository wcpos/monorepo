import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import EditOrder from './edit-order';
import Orders from './orders';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { OrdersProvider } from '../contexts/orders';
import Receipt from '../receipt';

export type OrdersStackParamList = {
	Orders: undefined;
	EditOrder: { orderID: string };
	Receipt: { orderID: string };
};

const Stack = createStackNavigator<OrdersStackParamList>();

/**
 *
 */
const OrdersNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Orders">
				{() => (
					<ErrorBoundary>
						<React.Suspense fallback={<Text>Loading orders</Text>}>
							<Orders />
						</React.Suspense>
					</ErrorBoundary>
				)}
			</Stack.Screen>
			<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
				<Stack.Screen name="EditOrder">
					{({ route }) => {
						const orderID = get(route, ['params', 'orderID']);
						return (
							<OrdersProvider initialQuery={{ selector: { uuid: orderID }, limit: 1 }}>
								<ModalLayout title={t('Edit Order', { _tags: 'core' })}>
									<React.Suspense fallback={<Text>Loading order</Text>}>
										<EditOrder />
									</React.Suspense>
								</ModalLayout>
							</OrdersProvider>
						);
					}}
				</Stack.Screen>
				<Stack.Screen name="Receipt">
					{({ route }) => {
						const orderID = get(route, ['params', 'orderID']);
						return (
							<OrdersProvider initialQuery={{ selector: { uuid: orderID }, limit: 1 }}>
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
									<React.Suspense fallback={<Text>Loading order</Text>}>
										<Receipt />
									</React.Suspense>
								</ModalLayout>
							</OrdersProvider>
						);
					}}
				</Stack.Screen>
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default OrdersNavigator;
