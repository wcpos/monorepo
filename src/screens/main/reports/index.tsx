import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { Suspense } from '@wcpos/tailwind/src/suspense';

import { Reports } from './reports';

export type CustomersStackParamList = {
	Customers: undefined;
	AddCustomer: undefined;
	EditCustomer: { customerID: string };
};

const Stack = createStackNavigator<CustomersStackParamList>();

/**
 *
 */
const ReportsWithProviders = () => {
	return (
		<ErrorBoundary>
			<Suspense>
				<Reports />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const ReportsNavigator = () => {
	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			<Stack.Screen name="Reports" component={ReportsWithProviders} />
			{/* <Stack.Group screenOptions={{ presentation: 'transparentModal' }}></Stack.Group> */}
		</Stack.Navigator>
	);
};

export default ReportsNavigator;
