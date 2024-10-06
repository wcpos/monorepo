import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { filter } from 'rxjs/operators';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';

import { AddCustomer } from './add-customer';
import Customers from './customers';
import { EditCustomer } from './edit-customer';
import { useCollection } from '../hooks/use-collection';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type CustomersStackParamList = {
	Customers: undefined;
	AddCustomer: undefined;
	EditCustomer: { customerID: string };
};

const Stack = createStackNavigator<CustomersStackParamList>();

/**
 *
 */
const CustomersWithProviders = () => {
	return (
		<ErrorBoundary>
			<Suspense>
				<Customers />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const AddCustomerWithProviders = ({
	navigation,
}: NativeStackScreenProps<CustomersStackParamList, 'AddCustomer'>) => {
	return (
		<ErrorBoundary>
			<AddCustomer />
		</ErrorBoundary>
	);
};

/**
 *
 */
const EditCustomerWithProviders = ({
	route,
	navigation,
}: NativeStackScreenProps<CustomersStackParamList, 'EditCustomer'>) => {
	const customerID = get(route, ['params', 'customerID']);
	const { collection } = useCollection('customers');
	const query = collection.findOneFix(customerID);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return (
		<ErrorBoundary>
			<Suspense>
				<EditCustomer resource={resource} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const CustomersNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Customers" component={CustomersWithProviders} />
			<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
				<Stack.Screen name="AddCustomer" component={AddCustomerWithProviders} />
				<Stack.Screen name="EditCustomer" component={EditCustomerWithProviders} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default CustomersNavigator;
