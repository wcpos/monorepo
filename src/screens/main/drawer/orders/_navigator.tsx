import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import { getModalLayout } from './_layout';
import EditOrder from './edit-order';
import Orders from './index';
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
			<Stack.Screen name="Orders" component={Orders} />
			<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
				<Stack.Screen
					name="EditOrder"
					getComponent={() => {
						return getModalLayout(EditOrder, { title: 'Edit Order' });
					}}
				/>
				<Stack.Screen name="Receipt" component={Receipt} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default OrdersNavigator;
