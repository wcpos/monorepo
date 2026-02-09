import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
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

/**
 *
 */
export const ReportsScreen = () => {
	const { uiSettings } = useUISettings('reports-orders');
	const { wpCredentials, store } = useAppState();
	const today = React.useMemo(() => new Date(), []);

	const selector: Record<string, unknown> = {
		status: 'completed',
		date_created_gmt: {
			$gte: convertLocalDateToUTCString(startOfDay(today)),
			$lte: convertLocalDateToUTCString(endOfDay(today)),
		},
		$and: [{ meta_data: { $elemMatch: { key: '_pos_user', value: String(wpCredentials?.id) } } }],
	};

	if (store?.id) {
		(selector.$and as Record<string, unknown>[]).push({
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
			sort: [{ [uiSettings.sortBy]: uiSettings.sortDirection as 'asc' | 'desc' }],
			selector,
		},
		greedy: true,
	});

	return (
		<ErrorBoundary>
			<Suspense>
				<ReportsProvider query={query!}>
					<Reports />
				</ReportsProvider>
			</Suspense>
		</ErrorBoundary>
	);
};
