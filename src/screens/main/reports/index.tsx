import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { Reports } from './reports';
import { useAppState } from '../../../contexts/app-state';
import { useUISettings } from '../contexts/ui-settings';

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
	const { uiSettings } = useUISettings('orders');
	const { wpCredentials, store } = useAppState();

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['orders', 'reports'],
		collectionName: 'orders',
		initialParams: {
			sortBy: uiSettings.sortBy,
			sortDirection: uiSettings.sortDirection,
			selector: {
				$and: [
					{ status: 'completed' },
					{ meta_data: { $elemMatch: { key: '_pos_user', value: String(wpCredentials?.id) } } },
					{ meta_data: { $elemMatch: { key: '_pos_store', value: String(store?.id) } } },
				],
			},
		},
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<Reports query={query} />
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
