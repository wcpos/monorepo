import React from 'react';
import { Platform, View } from 'react-native';

import { useRouter } from 'expo-router';
import isEqual from 'lodash/isEqual';

import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { VirtualizedListHandle } from '@wcpos/components/virtualized-list/types';
import { queryHandleAnswers$ } from '@wcpos/query';
import type { QueryHandle } from '@wcpos/query';
import type { SortFieldsByCollection } from '@wcpos/query/query-state';

import { ManagementBar } from '../components/management-bar';
import { QuerySearchInput } from '../components/query-search-input';
import { UpgradeNotice } from '../components/upgrade-notice';
import { UpgradeNoticeContext } from '../components/upgrade-notice/context';
import { useAppInfo } from '../../../hooks/use-app-info';
import { PaymentAttentionNotice } from './attention-notice';
import { DisplayOptions } from '../components/display-options';
import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Note } from './cells/note';
import { Receipt } from './cells/receipt';
import { FilterBar } from './filter-bar';
import { useBarcode } from './use-barcode';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { DataTable } from '../components/data-table';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { Cashier } from '../components/order/cashier';
import { Register } from '../components/order/register';
import { CreatedVia } from '../components/order/created-via';
import { Customer } from '../components/order/customer';
import { OrderNumber } from '../components/order/order-number';
import { PaymentMethod } from '../components/order/payment-method';
import { ListColumn, ListPage } from '../components/list-frame';
import { useUISettings } from '../contexts/ui-settings';
import { useReferencedCustomerDemand } from '../hooks/use-referenced-customer-demand';
import {
	QueryStateProvider,
	useCollectionQueryHandle,
	useQueryState,
	useQueryStateActions,
} from '../../../query';
import { DataTableRow } from '../components/data-table/rows';
import { useStoreDay } from '../../../hooks/use-store-day';
import { useStoreDayLabel } from '../../../hooks/use-store-day-label';
import { Status } from './cells/status';
import { DateCell } from './cells/date';
import { Total } from './cells/total';
import { OrderRow } from './row';
import { DayHeading, groupOrders, isDay, type OrderHit, type OrderListItem } from './day-heading';
import { useRowKeyboard } from './use-row-keyboard';

import type { Row } from '../../../table-types';
import type { DataTableFeatures } from '../components/data-table';
import type { FiltersOf, QueryStateOf } from '../../../query';
import type { ListTable } from '../components/list-frame';
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

type OrderListRow = Row<OrderListItem, DataTableFeatures>;

/** The row keyboard (web) and the order rows it moves through, for the rows the list draws. */
const RowKeyboardContext = React.createContext<{
	keyboard: ReturnType<typeof useRowKeyboard>;
	ids: string[];
} | null>(null);

/** An order's row in the keyboard's focus order. */
function KeyboardRow({
	uuid,
	coarse,
	children,
}: {
	uuid: string;
	coarse: boolean;
	children: React.ReactNode;
}) {
	const context = React.useContext(RowKeyboardContext);
	if (!context) return <>{children}</>;
	const { keyboard, ids } = context;
	const focusIndex = ids.indexOf(uuid);
	const focused = keyboard.focusIndex === focusIndex;
	return (
		<View
			testID={coarse ? `data-table-row-${uuid}` : undefined}
			tabIndex={Platform.OS === 'web' ? (focused ? 0 : -1) : undefined}
			onFocus={() => keyboard.focusFrom(focusIndex)}
			ref={(node) => keyboard.focusRow(focusIndex, node)}
			// The ring marks keyboard focus only (`keyboard.ring`): a click focuses the row too,
			// and must not draw it. Uniwind has no `focus-visible:`, so the hook decides.
			className={
				focused && keyboard.ring
					? 'web:outline-2 web:outline-primary web:-outline-offset-2'
					: undefined
			}
		>
			{children}
		</View>
	);
}

/** A day heading, or an order's row in the keyboard's order, drawn by `render`. */
function orderItem(
	coarse: boolean,
	render: (row: OrderListRow, record: OrderHit['record']) => React.ReactNode
) {
	return function renderOrderItem({ item }: { item: OrderListRow }) {
		return (
			<VirtualizedList.Item>
				{isDay(item.original) ? (
					<DayHeading {...item.original} />
				) : (
					<KeyboardRow uuid={item.original.record.uuid} coarse={coarse}>
						{render(item, item.original.record)}
					</KeyboardRow>
				)}
			</VirtualizedList.Item>
		);
	};
}

/** The table over the drawn orders, grouped by store day, with the row keyboard. */
function OrdersTable({
	handle,
	table,
	hits,
	open,
}: {
	handle: QueryHandle;
	table: ListTable<{ item: OrderListRow }>;
	hits: OrderHit[];
	open: (uuid: string) => void;
}) {
	const state = useQueryState<'orders'>();
	const { timezone } = useStoreDay();
	const { heading } = useStoreDayLabel();
	const data = groupOrders(hits, state.sort.field, timezone, heading);
	const ids = hits.map((hit) => hit.record.uuid);
	const listRef = React.useRef<VirtualizedListHandle>(null);
	const keyboard = useRowKeyboard(ids, open, (index) => {
		const itemIndex = data.findIndex((item) => !isDay(item) && item.record.uuid === ids[index]);
		listRef.current?.scrollToIndex({ index: itemIndex, align: 'center', animated: false });
	});
	return (
		<RowKeyboardContext.Provider value={{ keyboard, ids }}>
			<View
				className="flex-1"
				tabIndex={Platform.OS === 'web' ? 0 : undefined}
				onKeyDown={keyboard.onKeyDown}
			>
				<DataTable<OrderListItem>
					id="orders"
					collectionName="orders"
					handle={handle}
					sort={state.sort}
					cells={cells}
					estimatedItemSize={56}
					listRef={listRef}
					tableConfig={{
						data,
						getRowId: (item) => (isDay(item) ? item.id : item.record.uuid),
						extraData: { focusIndex: keyboard.focusIndex, ring: keyboard.ring },
					}}
					getItemType={(item: OrderListRow) => (isDay(item.original) ? 'day' : 'order')}
					{...table}
				/>
			</View>
		</RowKeyboardContext.Provider>
	);
}

/** The list: the part of the page the Free preview overlay covers. */
function OrdersBody({ initialFilters }: { initialFilters: Partial<FiltersOf<'orders'>> }) {
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	useBarcode(actions.setSearch);
	const handle = useCollectionQueryHandle('orders', state);
	// The customers the listed orders reference, asked for as the rows change: a reader of the
	// handle (it keeps the read while subscribed and declares nothing itself) that skips a
	// failed read, so it is still listening after the boundary's retry.
	const results$ = React.useMemo(() => queryHandleAnswers$(handle), [handle]);
	useReferencedCustomerDemand(results$);
	const router = useRouter();
	const t = useT();
	// A row opens the order modal (the one order surface), on its View tab.
	const open = (uuid: string) =>
		router.push({ pathname: '/orders/edit/[orderId]', params: { orderId: uuid } });
	return (
		<View testID="orders-body" className="flex-1">
			<ListColumn
				id="orders"
				chips={<FilterBar initialFilters={initialFilters} />}
				handle={handle}
				skeleton={<DataTableSkeleton id="orders" />}
				renderRow={{
					coarse: orderItem(true, (_, record) => <OrderRow record={record} onSelect={open} />),
					fine: orderItem(false, (item, record) => (
						<DataTableRow item={item} pressWhenActionsHidden={() => open(record.uuid)} />
					)),
				}}
				narrowed={!!state.search || !isEqual(state.filters, initialFilters)}
				empty={{
					title: t('orders.no_orders_yet'),
					description: t('orders.no_orders_yet_description'),
				}}
				noResults={{ title: t('orders.nothing_matches_filters'), clear: t('orders.clear_filters') }}
			>
				{(table, result) => (
					<OrdersTable handle={handle} table={table} hits={result.hits} open={open} />
				)}
			</ListColumn>
		</View>
	);
}

function OrdersScreenContent({ initialFilters }: { initialFilters: Partial<FiltersOf<'orders'>> }) {
	const t = useT();
	const { license } = useAppInfo();
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);
	return (
		<ListPage
			testID="screen-orders"
			pro="orders"
			bar={
				<>
					<ManagementBar
						// No title: the search's placeholder names the page and the rail marks it (owner, 2026-10-18).
						testID="orders-bar"
						search={
							<QuerySearchInput
								collectionName="orders"
								testID="search-orders"
								placeholder={t('orders.search_orders')}
							/>
						}
					>
						<DisplayOptions id="orders" />
					</ManagementBar>
					<PaymentAttentionNotice />
					{showUpgrade && !license?.isPro && (
						<UpgradeNotice setShowUpgrade={setShowUpgrade} underBar />
					)}
				</>
			}
		>
			<OrdersBody initialFilters={initialFilters} />
		</ListPage>
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
