import React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { VStack } from '@wcpos/components/vstack';

import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Note } from './cells/note';
import { Receipt } from './cells/receipt';
import { FilterBar } from './filter-bar';
import { UISettingsForm } from './ui-settings-form';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { DateCell } from '../components/date';
import { Cashier } from '../components/order/cashier';
import { CreatedVia } from '../components/order/created-via';
import { Customer } from '../components/order/customer';
import { OrderNumber } from '../components/order/order-number';
import { PaymentMethod } from '../components/order/payment-method';
import { Status } from '../components/order/status';
import { Total } from '../components/order/total';
import { QuerySearchInput } from '../components/query-search-input';
import { UISettingsDialog } from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';
import { TextCell } from '../components/text-cell';
import {
	QueryStateProvider,
	useCollectionBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { FiltersOf, QueryStateActions, QueryStateOf } from '../../../query';
import type { SortFieldsByCollection } from '../../../query/query-state-types';

type OrderDocument = import('@wcpos/database').OrderDocument;

const cells = {
	actions: Actions,
	billing: Address,
	shipping: Address,
	customer_id: Customer,
	customer_note: Note,
	status: Status,
	total: Total,
	date_created_gmt: DateCell,
	date_modified_gmt: DateCell,
	date_completed_gmt: DateCell,
	date_paid_gmt: DateCell,
	payment_method: PaymentMethod,
	created_via: CreatedVia,
	cashier: Cashier,
	receipt: Receipt,
	number: OrderNumber,
};

const ORDERS_PAGE_SIZE = 10;
const ORDER_SORT_FIELDS = [
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
const DEFAULT_ORDER_SORT = { field: 'date_created_gmt', direction: 'desc' } as const;

function isOrderSortField(field: unknown): field is SortFieldsByCollection['orders'] {
	return ORDER_SORT_FIELDS.some((sortField) => sortField === field);
}

function getInitialOrderSort(
	sortBy: unknown,
	sortDirection: unknown
): QueryStateOf<'orders'>['sort'] {
	if (!isOrderSortField(sortBy)) return DEFAULT_ORDER_SORT;

	return { field: sortBy, direction: sortDirection === 'asc' ? 'asc' : 'desc' };
}

function renderCell(columnKey: string, info: any) {
	const Renderer = cells[columnKey as keyof typeof cells];
	if (Renderer) {
		return <Renderer {...info} />;
	}

	return <TextCell {...info} />;
}

function OrdersScreenContent() {
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	const binding = useCollectionBinding('orders', state);
	const tableActions = React.useMemo<
		Pick<QueryStateActions<'orders'>, 'setSort' | 'extendLimit' | 'setFilter'>
	>(
		() => ({
			setSort: actions.setSort,
			extendLimit: actions.extendLimit,
			setFilter: actions.setFilter,
		}),
		[actions]
	);
	const t = useT();
	const { bottom } = useSafeAreaInsets();

	/**
	 *
	 */
	return (
		<View
			testID="screen-orders"
			className="h-full p-2"
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<VStack>
						<HStack>
							<QuerySearchInput
								collectionName="orders"
								placeholder={t('orders.search_orders')}
								className="flex-1"
								testID="search-orders"
							/>
							<UISettingsDialog title={t('orders.order_settings')}>
								<UISettingsForm />
							</UISettingsDialog>
						</HStack>
						<ErrorBoundary>
							<FilterBar />
						</ErrorBoundary>
					</VStack>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense fallback={<DataTableSkeleton id="orders" />}>
							<DataTable<OrderDocument>
								id="orders"
								resource={binding.resource}
								sort={state.sort}
								actions={tableActions}
								active$={binding.active$}
								total$={binding.total$}
								totalSource$={binding.totalSource$}
								sync={binding.sync}
								renderCell={renderCell}
								noDataMessage={t('common.no_orders_found')}
								estimatedItemSize={100}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}

/**
 *
 */
export function OrdersScreen() {
	const { uiSettings } = useUISettings('orders');
	const { wpCredentials, store } = useAppState();
	const initialSort = getInitialOrderSort(uiSettings.sortBy, uiSettings.sortDirection);
	const cashierScopeID = String(wpCredentials?.id);
	const storeScopeID = store?.id ? String(store.id) : 'woocommerce-pos';
	const initialFilters: Partial<FiltersOf<'orders'>> = {
		cashier: cashierScopeID,
		store: storeScopeID,
	};

	return (
		<QueryStateProvider
			key={`${cashierScopeID}:${storeScopeID}`}
			collection="orders"
			initialPageSize={ORDERS_PAGE_SIZE}
			initialSort={initialSort}
			initialFilters={initialFilters}
		>
			<OrdersScreenContent />
		</QueryStateProvider>
	);
}
