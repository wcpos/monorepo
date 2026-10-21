import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@wcpos/components/empty-state';
import { useIsPhone, usePointer } from '@wcpos/components/lib/device';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent } from '@wcpos/components/tooltip';
import type { EngineRecord, QueryHandle } from '@wcpos/query';
import type { SortFieldsByCollection } from '@wcpos/query/query-state';

import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Avatar } from './cells/avatar';
import { CustomerEmail } from './cells/email';
import { DisplayOptions } from './display-options';
import { CustomerRow as CoarseRow } from './row';
import { DateCell } from './cells/date';
import { ManagementBar } from '../components/management-bar';
import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { withProAccess } from '../components/pro-guard';
import { CapabilityTooltipTrigger } from '../components/capability-tooltip';
import { DataTable } from '../components/data-table';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { QuerySearchInput } from '../components/query-search-input';
import { useUISettings } from '../contexts/ui-settings';
import { useUserCapabilities } from '../hooks/use-user-capabilities';
import {
	QueryStateProvider,
	useCollectionQueryHandle,
	useDrawnHandle,
	useQuerySnapshot,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { QueryStateActions, QueryStateOf, SnapshotFields } from '../../../query';

type CustomerRow = { record: EngineRecord<'customers'> };

const cells = {
	avatar_url: Avatar,
	billing: Address,
	shipping: Address,
	actions: Actions,
	email: CustomerEmail,
	date_created_gmt: DateCell,
	date_modified_gmt: DateCell,
};

const CUSTOMERS_PAGE_SIZE = 10;
const CUSTOMER_SORT_FIELDS = [
	'id',
	'first_name',
	'last_name',
	'email',
	'role',
	'username',
	'date_created_gmt',
	'date_modified_gmt',
] as const satisfies readonly SortFieldsByCollection['customers'][];
const DEFAULT_CUSTOMER_SORT = { field: 'last_name', direction: 'asc' } as const;

function isCustomerSortField(field: unknown): field is SortFieldsByCollection['customers'] {
	return CUSTOMER_SORT_FIELDS.some((sortField) => sortField === field);
}

function getInitialCustomerSort(
	sortBy: unknown,
	sortDirection: unknown
): QueryStateOf<'customers'>['sort'] {
	if (!isCustomerSortField(sortBy)) return DEFAULT_CUSTOMER_SORT;

	return {
		field: sortBy,
		direction: sortDirection === 'desc' ? 'desc' : 'asc',
	};
}

// The list re-renders for the answer only; the table and the footer read their own fields.
const ANSWER_ONLY: SnapshotFields = [];

function CustomersList({
	handle,
}: {
	/** The customers query handle (roadmap#423): the list and its table read its snapshot. */
	handle: QueryHandle;
}) {
	const state = useQueryState<'customers'>();
	const actions = useQueryStateActions<'customers'>();
	// Suspended on until the first answer (the body's boundary draws the skeleton); a changed
	// query keeps the current rows while the new handle answers (`useDrawnHandle`).
	const shown = useDrawnHandle(handle);
	const { result } = useQuerySnapshot(shown, ANSWER_ONLY);
	const deferredResult = React.useDeferredValue(result);
	const pending = deferredResult.searchState === 'pending' && deferredResult.hits.length > 0;
	const emptyStore = !state.search;
	const pointer = usePointer();
	const t = useT();
	const tableActions = React.useMemo<
		Pick<QueryStateActions<'customers'>, 'setSort' | 'extendLimit' | 'setFilter'>
	>(
		() => ({
			setSort: actions.setSort,
			extendLimit: actions.extendLimit,
			setFilter: actions.setFilter,
		}),
		[actions]
	);

	return (
		<>
			{pending && <View testID="customers-searching-line" className="bg-primary h-0.5" />}
			<View className={`flex-1 ${pending ? 'opacity-60' : ''}`}>
				<DataTable<CustomerRow>
					id="customers"
					gutter="page"
					collectionName="customers"
					handle={handle}
					sort={state.sort}
					actions={tableActions}
					cells={cells}
					estimatedItemSize={56}
					renderItem={
						pointer === 'coarse'
							? ({ item }) => (
									<VirtualizedList.Item>
										<View testID={`data-table-row-${item.original.record.uuid}`}>
											<CoarseRow record={item.original.record} />
										</View>
									</VirtualizedList.Item>
								)
							: undefined
					}
					noDataMessage={
						<EmptyState
							testID="no-data-message"
							size="surface"
							kind={emptyStore ? 'empty' : 'no-results'}
							title={t(
								emptyStore ? 'customers.no_customers_yet' : 'customers.nothing_matches_search'
							)}
							description={emptyStore ? t('customers.no_customers_yet_description') : undefined}
							action={
								emptyStore
									? undefined
									: {
											label: t('customers.clear_search'),
											onPress: () => {
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

/** The list: the part of the page the Free preview overlay covers. */
function CustomersBody() {
	const state = useQueryState<'customers'>();
	const handle = useCollectionQueryHandle('customers', state);
	const phone = useIsPhone();
	return (
		// No chip row here to own the page gutter over the card (TableSurface owns its sides and
		// bottom only), so the body does; the phone list runs edge to edge under the search row.
		<View testID="customers-body" className={phone ? 'flex-1' : 'flex-1 pt-4'}>
			{/* A failed customers read is thrown here; the fallback's reset asks the handle again,
			    and a changed query (its handle is new) clears the fallback on its own. */}
			<ErrorBoundary onReset={() => handle.retry()} resetKeys={[handle]}>
				<Suspense fallback={<DataTableSkeleton id="customers" gutter="page" />}>
					<CustomersList handle={handle} />
				</Suspense>
			</ErrorBoundary>
		</View>
	);
}

// The guard wraps the body only: on Free the preview overlay must leave the bar's menu, bell
// and cashier reachable, or a Free user below lg has no way off this page (Orders, Codex review).
const GuardedCustomersBody = withProAccess(CustomersBody, 'customers');

function CustomersScreenContent() {
	const t = useT();
	const router = useRouter();
	const { bottom } = useSafeAreaInsets();
	// The bar sits outside the guard, so it reads the licence itself.
	const { license } = useAppInfo();
	const readOnly = !(license?.isPro ?? false);
	const { caps } = useUserCapabilities();
	return (
		<View
			testID="screen-customers"
			className="bg-background flex-1"
			style={{ paddingBottom: bottom || undefined }}
		>
			<ManagementBar
				// No title: the search's placeholder names the page and the rail marks it (owner, 2026-10-18).
				testID="customers-bar"
				search={
					<QuerySearchInput
						collectionName="customers"
						placeholder={t('common.search_customers')}
						testID="search-customers"
					/>
				}
			>
				<Tooltip showOnNative={readOnly || !caps.canCreateCustomers}>
					<CapabilityTooltipTrigger>
						<IconButton
							testID="customers-add-button"
							name="addCustomer"
							accessibilityLabel={t('common.add_new_customer')}
							onPress={() => router.push({ pathname: '/customers/add' })}
							disabled={readOnly || !caps.canCreateCustomers}
						/>
					</CapabilityTooltipTrigger>
					<TooltipContent>
						<Text>
							{readOnly
								? t('common.upgrade_to_pro')
								: !caps.canCreateCustomers
									? t('capability_hints.create_customers_admin_path')
									: t('common.add_new_customer')}
						</Text>
					</TooltipContent>
				</Tooltip>
				<DisplayOptions />
			</ManagementBar>

			<GuardedCustomersBody />
		</View>
	);
}

export function CustomersScreen() {
	const { uiSettings } = useUISettings('customers');
	const initialSort = getInitialCustomerSort(uiSettings.sortBy, uiSettings.sortDirection);

	return (
		<QueryStateProvider
			collection="customers"
			initialPageSize={CUSTOMERS_PAGE_SIZE}
			initialSort={initialSort}
		>
			<CustomersScreenContent />
		</QueryStateProvider>
	);
}
