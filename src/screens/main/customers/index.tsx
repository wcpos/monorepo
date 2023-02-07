import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import AddCustomer from './add-customer';
import Customers from './customers';
import EditCustomer from './edit-customer';
import { ModalLayout } from '../../components/modal-layout';
import { CustomersProvider } from '../contexts/customers';

export type CustomersStackParamList = {
	Customers: undefined;
	AddCustomer: undefined;
	EditCustomer: { customerID: string };
};

const Stack = createStackNavigator<CustomersStackParamList>();

export const customersStackRoutes = {
	path: 'customers',
	screens: {
		Customers: {
			path: '',
		},
		AddCustomer: {
			path: 'add',
		},
		EditCustomer: {
			path: 'edit/:customerID',
		},
	},
};

/**
 *
 */
const CustomersNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Customers">
				{() => (
					<ErrorBoundary>
						<React.Suspense fallback={<Text>Loading customers</Text>}>
							<Customers />
						</React.Suspense>
					</ErrorBoundary>
				)}
			</Stack.Screen>
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
			<Stack.Screen name="EditCustomer" options={{ presentation: 'transparentModal' }}>
				{({ route }) => {
					const { customerID } = route.params;
					/** @TODO - findOne */
					return (
						<CustomersProvider initialQuery={{ filters: { uuid: customerID } }}>
							<ModalLayout>
								<React.Suspense fallback={<Text>Loading customer</Text>}>
									<EditCustomer />
								</React.Suspense>
							</ModalLayout>
						</CustomersProvider>
					);
				}}
			</Stack.Screen>
		</Stack.Navigator>
	);
};

export default CustomersNavigator;
