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
import { VStack } from '@wcpos/components/vstack';

import { Actions } from './cells/actions';
import { Active } from './cells/active';
import { DiscountType } from './cells/discount-type';
import { EditableAmount } from './cells/editable-amount';
import { EditableCode } from './cells/editable-code';
import { EditableDate } from './cells/editable-date';
import { EditableDescription } from './cells/editable-description';
import { Status } from './cells/status';
import { Usage } from './cells/usage';
import { FilterBar } from './filter-bar';
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
import { useMutation } from '../hooks/mutations/use-mutation';
import {
	QueryStateProvider,
	useCollectionBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { QueryStateActions, QueryStateOf } from '../../../query';
import type { SortFieldsByCollection } from '../../../query/query-state-types';

type CouponDocument = import('@wcpos/database').CouponDocument;

const cells = {
	active: Active,
	code: EditableCode,
	description: EditableDescription,
	amount: EditableAmount,
	discount_type: DiscountType,
	status: Status,
	usage_count: Usage,
	actions: Actions,
	date_expires_gmt: EditableDate,
	date_created_gmt: DateCell,
	date_modified_gmt: DateCell,
};

const COUPONS_PAGE_SIZE = 10;
const COUPON_SORT_FIELDS = [
	'code',
	'amount',
	'discount_type',
	'status',
	'usage_count',
	'date_expires_gmt',
	'date_created_gmt',
	'date_modified_gmt',
] as const satisfies readonly SortFieldsByCollection['coupons'][];
const DEFAULT_COUPON_SORT = { field: 'date_created_gmt', direction: 'desc' } as const;

function isCouponSortField(field: unknown): field is SortFieldsByCollection['coupons'] {
	return COUPON_SORT_FIELDS.some((sortField) => sortField === field);
}

function getInitialCouponSort(
	sortBy: unknown,
	sortDirection: unknown
): QueryStateOf<'coupons'>['sort'] {
	if (!isCouponSortField(sortBy)) return DEFAULT_COUPON_SORT;

	return { field: sortBy, direction: sortDirection === 'asc' ? 'asc' : 'desc' };
}

function renderCell(columnKey: string, info: Record<string, unknown>) {
	const Renderer = cells[columnKey as keyof typeof cells];
	if (Renderer) {
		return <Renderer {...(info as any)} />;
	}

	return <TextCell {...(info as any)} />;
}

function CouponsScreenContent() {
	const state = useQueryState<'coupons'>();
	const actions = useQueryStateActions<'coupons'>();
	const binding = useCollectionBinding('coupons', state);
	const tableActions = React.useMemo<
		Pick<QueryStateActions<'coupons'>, 'setSort' | 'extendLimit' | 'setFilter'>
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
	const { patch } = useMutation({ collectionName: 'coupons' });

	const tableConfig = React.useMemo(
		() => ({
			meta: {
				onChange: ({
					document,
					changes,
				}: {
					document: CouponDocument;
					changes: Record<string, unknown>;
				}) => {
					patch({ document, data: changes });
				},
			},
		}),
		[patch]
	);

	return (
		<View
			testID="screen-coupons"
			className="h-full p-2"
			style={{ paddingBottom: bottom !== 0 ? bottom : undefined }}
		>
			<Card className="flex-1">
				<CardHeader className="bg-card-header p-2">
					<VStack>
						<HStack>
							<QuerySearchInput
								collectionName="coupons"
								placeholder={t('common.search_coupons')}
								className="flex-1"
								testID="search-coupons"
							/>
							<Tooltip>
								<TooltipTrigger asChild>
									<IconButton
										name="plus"
										onPress={() => router.push({ pathname: '/coupons/add' })}
										disabled={readOnly}
									/>
								</TooltipTrigger>
								<TooltipContent>
									<Text>{readOnly ? t('common.upgrade_to_pro') : t('coupons.add_coupon')}</Text>
								</TooltipContent>
							</Tooltip>
							<UISettingsDialog title={t('coupons.coupon_settings')}>
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
						<Suspense fallback={<DataTableSkeleton id="coupons" />}>
							<DataTable<CouponDocument>
								id="coupons"
								resource={binding.resource}
								sort={state.sort}
								actions={tableActions}
								active$={binding.active$}
								total$={binding.total$}
								totalSource$={binding.totalSource$}
								sync={binding.sync}
								renderCell={renderCell}
								noDataMessage={t('common.no_coupons_found')}
								estimatedItemSize={100}
								tableConfig={tableConfig}
							/>
						</Suspense>
					</ErrorBoundary>
				</CardContent>
			</Card>
		</View>
	);
}

export function CouponsScreen() {
	const { uiSettings } = useUISettings('coupons');
	const initialSort = getInitialCouponSort(uiSettings.sortBy, uiSettings.sortDirection);

	return (
		<QueryStateProvider
			collection="coupons"
			initialPageSize={COUPONS_PAGE_SIZE}
			initialSort={initialSort}
		>
			<CouponsScreenContent />
		</QueryStateProvider>
	);
}
