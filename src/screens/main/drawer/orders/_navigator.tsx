import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import EditOrder from './edit-order';
import Orders from './index';

export type OrdersStackParamList = {
	Orders: undefined;
	EditOrder: { orderID: string };
};

const Stack = createStackNavigator<OrdersStackParamList>();

/**
 *
 */
const OrdersNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Orders" component={Orders} />
			<Stack.Screen
				name="EditOrder"
				component={EditOrder}
				options={{ presentation: 'transparentModal' }}
			/>
		</Stack.Navigator>
	);
};

export default OrdersNavigator;
