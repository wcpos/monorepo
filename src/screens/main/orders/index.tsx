import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import EditOrder from './edit-order';
import Orders from './orders';
import { ModalLayout } from '../../components/modal-layout';
import { OrdersProvider } from '../contexts/orders';
import Receipt from '../receipt';

export type OrdersStackParamList = {
	Orders: undefined;
	EditOrder: { orderID: string };
	Receipt: { orderID: string };
};

const Stack = createStackNavigator<OrdersStackParamList>();

export const ordersStackRoutes = {
	path: 'orders',
	screens: {
		Orders: {
			path: '',
		},
		EditOrder: {
			path: 'edit/:orderID',
		},
		Receipt: {
			path: 'receipt/:orderID',
		},
	},
};

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
						const { orderID } = route.params;
						/** @TODO - findOne */
						return (
							<OrdersProvider initialQuery={{ filters: { uuid: orderID } }}>
								<ModalLayout>
									<React.Suspense fallback={<Text>Loading order</Text>}>
										<EditOrder />
									</React.Suspense>
								</ModalLayout>
							</OrdersProvider>
						);
					}}
				</Stack.Screen>
				<Stack.Screen name="Receipt" component={Receipt} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default OrdersNavigator;
