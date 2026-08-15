import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { ReportsProvider } from './context';
import { Reports } from './reports';
import { useAppState } from '../../../contexts/app-state';
import { convertLocalDateToUTCString } from '../../../hooks/use-local-date';
import { useUISettings } from '../contexts/ui-settings';
import { QueryStateProvider, useCollectionBinding, useQueryState } from '../../../query';

import type { FiltersOf, QueryStateOf } from '../../../query';
import type { SortFieldsByCollection } from '../../../query/query-state-types';

export type CustomersStackParamList = {
	Customers: undefined;
	AddCustomer: undefined;
	EditCustomer: { customerID: string };
};

const REPORTS_ALL_RESULTS_LIMIT = Number.MAX_SAFE_INTEGER;
const REPORT_SORT_FIELDS = [
	'status',
	'number',
	'customer_id',
	'total',
	'date_created_gmt',
	'date_modified_gmt',
	'date_completed_gmt',
	'date_paid_gmt',
	'payment_method',
] as const satisfies readonly SortFieldsByCollection['orders'][];
const DEFAULT_REPORT_SORT = { field: 'date_created_gmt', direction: 'desc' } as const;

function isReportSortField(field: unknown): field is SortFieldsByCollection['orders'] {
	return REPORT_SORT_FIELDS.some((sortField) => sortField === field);
}

function getInitialReportSort(
	sortBy: unknown,
	sortDirection: unknown
): QueryStateOf<'orders'>['sort'] {
	if (!isReportSortField(sortBy)) return DEFAULT_REPORT_SORT;

	return { field: sortBy, direction: sortDirection === 'asc' ? 'asc' : 'desc' };
}

function ReportsScreenContent() {
	const state = useQueryState<'orders'>();
	const binding = useCollectionBinding('orders', state);

	return (
		<ReportsProvider binding={binding}>
			<Reports />
		</ReportsProvider>
	);
}

/**
 *
 */
export function ReportsScreen() {
	const { uiSettings } = useUISettings('reports-orders');
	const { wpCredentials, store } = useAppState();
	const today = React.useMemo(() => new Date(), []);
	const cashierScopeID = String(wpCredentials?.id);
	const storeScopeID = store?.id ? String(store.id) : 'woocommerce-pos';
	const initialFilters: Partial<FiltersOf<'orders'>> = {
		status: 'completed',
		dateRange: {
			from: convertLocalDateToUTCString(startOfDay(today)),
			to: convertLocalDateToUTCString(endOfDay(today)),
		},
		cashier: cashierScopeID,
		store: storeScopeID,
	};
	const initialSort = getInitialReportSort(uiSettings.sortBy, uiSettings.sortDirection);

	return (
		<QueryStateProvider
			key={`${cashierScopeID}:${storeScopeID}`}
			collection="orders"
			initialPageSize={REPORTS_ALL_RESULTS_LIMIT}
			initialSort={initialSort}
			initialFilters={initialFilters}
		>
			<ErrorBoundary>
				<Suspense>
					<ReportsScreenContent />
				</Suspense>
			</ErrorBoundary>
		</QueryStateProvider>
	);
}
