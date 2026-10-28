import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent } from '@wcpos/components/tooltip';
import type { ReadonlyEngineRecord } from '@wcpos/query';
import type { SortFieldsByCollection } from '@wcpos/query/query-state';

import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Avatar } from './cells/avatar';
import { CustomerEmail } from './cells/email';
import { DisplayOptions } from '../components/display-options';
import { CustomerRow as CoarseRow } from './row';
import { DateCell } from './cells/date';
import { ManagementBar } from '../components/management-bar';
import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { ListColumn, ListPage } from '../components/list-frame';
import { CapabilityTooltipTrigger } from '../components/capability-tooltip';
import { DataTable } from '../components/data-table';
import { DataTableRow } from '../components/data-table/rows';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { QuerySearchInput } from '../components/query-search-input';
import { useProAccess } from '../contexts/pro-access';
import { useUISettings } from '../contexts/ui-settings';
import { useUserCapabilities } from '../hooks/use-user-capabilities';
import { QueryStateProvider, useCollectionQueryHandle, useQueryState } from '../../../query';

import type { QueryStateOf } from '../../../query';
import type { Row } from '../../../table-types';
import type { DataTableFeatures } from '../components/data-table';

type CustomerRow = { record: ReadonlyEngineRecord<'customers'> };

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

/** The list's column: the part of the page the Free preview overlay covers. */
function CustomersColumn() {
	const state = useQueryState<'customers'>();
	const handle = useCollectionQueryHandle('customers', state);
	const t = useT();
	const router = useRouter();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	// The caret opens the customer; the row only while the Actions column is hidden.
	const editable = !readOnly && caps.canEditCustomers;
	const open = (uuid: string) =>
		router.push({ pathname: '/customers/edit/[customerId]', params: { customerId: uuid } });
	return (
		<ListColumn
			testID="customers-body"
			id="customers"
			handle={handle}
			skeleton={<DataTableSkeleton id="customers" />}
			renderRow={{
				coarse: ({ item }: { item: Row<CustomerRow, DataTableFeatures> }) => (
					<VirtualizedList.Item>
						<View testID={`data-table-row-${item.original.record.uuid}`}>
							<CoarseRow record={item.original.record} />
						</View>
					</VirtualizedList.Item>
				),
				fine: ({ item }) => (
					<VirtualizedList.Item>
						<DataTableRow
							item={item}
							pressWhenActionsHidden={editable ? () => open(item.original.record.uuid) : undefined}
						/>
					</VirtualizedList.Item>
				),
			}}
			narrowed={!!state.search}
			empty={{
				title: t('customers.no_customers_yet'),
				description: t('customers.no_customers_yet_description'),
			}}
			noResults={{
				title: t('customers.nothing_matches_search'),
				clear: t('customers.clear_search'),
			}}
		>
			{(table) => (
				<DataTable<CustomerRow>
					id="customers"
					collectionName="customers"
					handle={handle}
					sort={state.sort}
					cells={cells}
					estimatedItemSize={56}
					{...table}
				/>
			)}
		</ListColumn>
	);
}

function CustomersScreenContent() {
	const t = useT();
	const router = useRouter();
	// The bar sits outside the guard, so it reads the licence itself.
	const { license } = useAppInfo();
	const readOnly = !(license?.isPro ?? false);
	const { caps } = useUserCapabilities();
	return (
		<ListPage
			testID="screen-customers"
			pro="customers"
			bar={
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
					<DisplayOptions id="customers" />
				</ManagementBar>
			}
		>
			<CustomersColumn />
		</ListPage>
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
