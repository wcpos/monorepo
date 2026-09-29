import React from 'react';
import { Platform, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';
import isEqual from 'lodash/isEqual';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { EmptyState } from '@wcpos/components/empty-state';
import { usePointer } from '@wcpos/components/lib/device';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { VirtualizedListHandle } from '@wcpos/components/virtualized-list/types';

import { Actions } from '../cells/actions';
import { Address } from '../cells/address';
import { Note } from '../cells/note';
import { Receipt } from '../cells/receipt';
import { FilterBar } from './filter-bar';
import { useBarcode } from '../use-barcode';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { DataTable } from '../../components/data-table/v2';
import { DataTableSkeleton } from '../../components/data-table/v2/skeleton';
import { Cashier } from '../../components/order/cashier';
import { Register } from '../../components/order/register';
import { CreatedVia } from '../../components/order/created-via';
import { Customer } from '../../components/order/customer';
import { OrderNumber } from '../../components/order/order-number';
import { PaymentMethod } from '../../components/order/payment-method';
import { useUISettings } from '../../contexts/ui-settings';
import { useReferencedCustomerDemand } from '../../hooks/use-referenced-customer-demand';
import {
	QueryStateProvider,
	useCollectionBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../../query';
import { DataTableRow } from '../../components/data-table/v2/rows';
import { useStoreDay } from '../../../../hooks/use-store-day';
import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';
import { Status } from './cells/status';
import { DateCell } from './cells/date';
import { Total } from './cells/total';
import { OrderRow } from './row';
import { DayHeading, groupOrders, isDay, type OrderListItem } from './day-heading';
import { useRowKeyboard } from './use-row-keyboard';

import type { Row } from '../../../../table-types';
import type { DataTableFeatures } from '../../components/data-table/v2';
import type { SortFieldsByCollection } from '../../../../query/query-state-types';
import type { FiltersOf, QueryStateOf } from '../../../../query';
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
	register: Register,
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
const DEFAULT_ORDER_SORT = {
	field: 'date_created_gmt',
	direction: 'desc',
} as const;

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

function OrdersList({
	binding,
	initialFilters,
}: {
	binding: ReturnType<typeof useCollectionBinding<'orders'>>;
	initialFilters: Partial<FiltersOf<'orders'>>;
}) {
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	const result = useObservableSuspense(binding.resource);
	const deferredResult = React.useDeferredValue(result);
	const { timezone } = useStoreDay();
	const { heading } = useStoreDayLabel();
	const pointer = usePointer();
	const router = useRouter();
	const { order: selected } = useLocalSearchParams<{ order?: string }>();
	const t = useT();
	const data = groupOrders(deferredResult.hits, state.sort.field, timezone, heading);
	const ids = deferredResult.hits.map((hit) => hit.record.uuid);
	const listRef = React.useRef<VirtualizedListHandle>(null);
	const select = (uuid: string | null) => {
		if (uuid !== selected) router.setParams({ order: uuid ?? undefined });
	};
	const keyboard = useRowKeyboard(ids, select, (index) => {
		const itemIndex = data.findIndex((item) => !isDay(item) && item.record.uuid === ids[index]);
		listRef.current?.scrollToIndex({ index: itemIndex, align: 'center', animated: false });
	});
	const tableActions = React.useMemo(
		() => ({
			setSort: actions.setSort,
			extendLimit: actions.extendLimit,
			setFilter: actions.setFilter,
		}),
		[actions]
	);
	const emptyStore = !state.search && isEqual(state.filters, initialFilters);
	const pending = deferredResult.searchState === 'pending' && deferredResult.hits.length > 0;
	const renderItem = ({ item }: { item: Row<OrderListItem, DataTableFeatures>; index: number }) => {
		if (isDay(item.original))
			return (
				<VirtualizedList.Item>
					<DayHeading {...item.original} />
				</VirtualizedList.Item>
			);
		const record = item.original.record;
		const focusIndex = ids.indexOf(record.uuid);
		const focused = keyboard.focusIndex === focusIndex;
		return (
			<VirtualizedList.Item>
				<View
					testID={pointer === 'coarse' ? `data-table-row-${record.uuid}` : undefined}
					aria-selected={selected === record.uuid}
					tabIndex={Platform.OS === 'web' ? (focused ? 0 : -1) : undefined}
					onFocus={() => keyboard.setFocusIndex(focusIndex)}
					ref={(node) => keyboard.focusRow(focusIndex, node)}
					className={`${selected === record.uuid ? 'bg-muted' : ''} ${focused ? 'web:outline-2 web:outline-primary web:-outline-offset-2' : ''}`}
				>
					{pointer === 'coarse' ? (
						<OrderRow record={record} onSelect={select} />
					) : (
						<DataTableRow item={item} onPress={() => select(record.uuid)} />
					)}
				</View>
			</VirtualizedList.Item>
		);
	};
	return (
		<>
			<ErrorBoundary>
				<FilterBar initialFilters={initialFilters} />
			</ErrorBoundary>
			{pending && <View testID="orders-searching-line" className="bg-primary h-0.5" />}
			<View
				className={`flex-1 ${pending ? 'opacity-60' : ''}`}
				tabIndex={Platform.OS === 'web' ? 0 : undefined}
				onKeyDown={keyboard.onKeyDown}
			>
				<DataTable<OrderListItem>
					id="orders"
					collectionName="orders"
					binding={binding}
					resource={binding.resource}
					sort={state.sort}
					actions={tableActions}
					active$={binding.active$}
					total$={binding.total$}
					sync={binding.sync}
					cells={cells}
					estimatedItemSize={56}
					renderItem={renderItem}
					listRef={listRef}
					tableConfig={{
						data,
						getRowId: (item) => (isDay(item) ? item.id : item.record.uuid),
						extraData: { selected, focusIndex: keyboard.focusIndex },
					}}
					getItemType={(item: Row<OrderListItem, DataTableFeatures>) =>
						isDay(item.original) ? 'day' : 'order'
					}
					noDataMessage={
						<EmptyState
							testID="no-data-message"
							size="surface"
							kind={emptyStore ? 'empty' : 'no-results'}
							title={t(emptyStore ? 'orders.no_orders_yet' : 'orders.nothing_matches_filters')}
							description={emptyStore ? t('orders.no_orders_yet_description') : undefined}
							action={
								emptyStore
									? undefined
									: {
											label: t('orders.clear_filters'),
											onPress: () => {
												actions.resetFilters();
												actions.clearSearch();
											},
										}
							}
						/>
					}
				/>
			</View>
		</>
	);
}

function OrdersScreenContent({ initialFilters }: { initialFilters: Partial<FiltersOf<'orders'>> }) {
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	useBarcode(actions.setSearch);
	const binding = useCollectionBinding('orders', state);
	useReferencedCustomerDemand(binding.result$);
	const { bottom } = useSafeAreaInsets();
	return (
		<View
			testID="screen-orders"
			className="bg-background flex-1"
			style={{ paddingBottom: bottom || undefined }}
		>
			{/* TODO(stage 3): Orders page bar, search and pane. */}
			<View />
			<ErrorBoundary>
				<Suspense fallback={<DataTableSkeleton id="orders" />}>
					<OrdersList binding={binding} initialFilters={initialFilters} />
				</Suspense>
			</ErrorBoundary>
		</View>
	);
}

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
			<OrdersScreenContent initialFilters={initialFilters} />
		</QueryStateProvider>
	);
}
