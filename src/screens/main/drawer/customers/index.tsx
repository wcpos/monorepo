import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import AddCustomer from './add-customer';
import Customers from './customers';
import EditCustomer from './edit-customer';
import { CustomersProvider } from '../../../../contexts/customers';
import { ModalLayout } from '../../../components/modal-layout';

export type CustomersStackParamList = {
	Customers: undefined;
	AddCustomer: undefined;
	EditCustomer: { customerID: string };
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
				name="AddCustomer"
				component={() => {
					return (
						<ModalLayout>
							<AddCustomer />
						</ModalLayout>
					);
				}}
				options={{ presentation: 'transparentModal' }}
			/>
			<Stack.Screen
				name="EditCustomer"
				component={({ route }) => {
					const { customerID } = route.params;
					/** @TODO - findOne */
					return (
						<CustomersProvider initialQuery={{ filters: { uuid: customerID } }}>
							<ModalLayout>
								<EditCustomer />
							</ModalLayout>
						</CustomersProvider>
					);
				}}
				options={{ presentation: 'transparentModal' }}
			/>
		</Stack.Navigator>
	);
};

export default CustomersNavigator;
