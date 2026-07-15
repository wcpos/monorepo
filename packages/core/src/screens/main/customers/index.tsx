import React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { Actions } from './cells/actions';
import { Address } from './cells/address';
import { Avatar } from './cells/avatar';
import { CustomerEmail } from './cells/email';
import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { useProAccess } from '../contexts/pro-access';
import { DataTable } from '../components/data-table';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { TextCell } from '../components/text-cell';
import { DateCell } from '../components/date';
import { UISettingsDialog } from '../components/ui-settings';
import { QuerySearchInput } from '../components/query-search-input';
import { useUISettings } from '../contexts/ui-settings';
import {
	QueryStateProvider,
	useCollectionBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { QueryStateActions, QueryStateOf } from '../../../query';
import type { SortFieldsByCollection } from '../../../query/query-state-types';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

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

	return { field: sortBy, direction: sortDirection === 'desc' ? 'desc' : 'asc' };
}

function renderCell(columnKey: string, info: Record<string, unknown>) {
	const Renderer = cells[columnKey as keyof typeof cells];
	if (Renderer) {
		return <Renderer {...(info as any)} />;
	}

	return <TextCell {...(info as any)} />;
}

function CustomersScreenContent() {
	const state = useQueryState<'customers'>();
	const actions = useQueryStateActions<'customers'>();
	const binding = useCollectionBinding('customers', state);
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
	const t = useT();
	const router = useRouter();
	const { bottom } = useSafeAreaInsets();
	const { readOnly } = useProAccess();

	/**
	 *
	 */
	return (
		<View
			testID="screen-customers"
			className="h-full p-2"
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-0">
					<HStack className="p-2">
						<QuerySearchInput
							collectionName="customers"
							placeholder={t('common.search_customers')}
							className="flex-1"
							testID="search-customers"
						/>
						<Tooltip>
							<TooltipTrigger asChild>
								<IconButton
									name="userPlus"
									onPress={() => router.push({ pathname: '/customers/add' })}
									disabled={readOnly}
								/>
							</TooltipTrigger>
							<TooltipContent>
								<Text>{readOnly ? t('common.upgrade_to_pro') : t('common.add_new_customer')}</Text>
							</TooltipContent>
						</Tooltip>
						<UISettingsDialog title={t('customers.customer_settings')}>
							<UISettingsForm />
						</UISettingsDialog>
					</HStack>
				</CardHeader>
				<CardContent className="border-border flex-1 border-t p-0">
					<ErrorBoundary>
						<Suspense fallback={<DataTableSkeleton id="customers" />}>
							<DataTable<CustomerDocument>
								id="customers"
								collectionName="customers"
								resource={binding.resource}
								sort={state.sort}
								actions={tableActions}
								active$={binding.active$}
								total$={binding.total$}
								totalSource$={binding.totalSource$}
								sync={binding.sync}
								renderCell={renderCell}
								noDataMessage={t('common.no_customers_found')}
								estimatedItemSize={100}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
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
