import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import { endOfDay, startOfDay } from 'date-fns';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { Reports } from './reports';
import { useAppState } from '../../../contexts/app-state';
import { convertLocalDateToUTCString } from '../../../hooks/use-local-date';
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
	const today = React.useMemo(() => new Date(), []);

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
					{
						date_created_gmt: {
							$gte: convertLocalDateToUTCString(startOfDay(today)),
							$lte: convertLocalDateToUTCString(endOfDay(today)),
						},
					},
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
