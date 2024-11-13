import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import { endOfDay, startOfDay } from 'date-fns';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import { ReportsProvider } from './context';
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
	const { uiSettings } = useUISettings('reports-orders');
	const { wpCredentials, store } = useAppState();
	const today = React.useMemo(() => new Date(), []);

	const selector = {
		status: 'completed',
		date_created_gmt: {
			$gte: convertLocalDateToUTCString(startOfDay(today)),
			$lte: convertLocalDateToUTCString(endOfDay(today)),
		},
		$and: [{ meta_data: { $elemMatch: { key: '_pos_user', value: String(wpCredentials?.id) } } }],
	};

	if (store?.id) {
		selector.$and.push({
			meta_data: { $elemMatch: { key: '_pos_store', value: String(store?.id) } },
		});
	} else {
		selector.created_via = 'woocommerce-pos';
	}

	/**
	 *
	 */
	const query = useQuery({
		queryKeys: ['orders', 'reports'],
		collectionName: 'orders',
		initialParams: {
			sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection }],
			selector,
		},
		greedy: true,
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<ReportsProvider query={query}>
					<Reports />
				</ReportsProvider>
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
