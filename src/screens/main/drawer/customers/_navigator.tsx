import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import EditCustomer from './edit-customer';
import Customers from './index';

export type CustomersStackParamList = {
	Customers: undefined;
	EditCustomer: undefined;
};

const Stack = createStackNavigator<CustomersStackParamList>();

/**
 *
 */
const CustomersNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Customers" component={Customers} />
			<Stack.Screen
				name="EditCustomer"
				component={EditCustomer}
				options={{ presentation: 'transparentModal' }}
			/>
		</Stack.Navigator>
	);
};

export default CustomersNavigator;
