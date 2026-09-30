import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@wcpos/components/empty-state';
import { usePointer } from '@wcpos/components/lib/device';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent } from '@wcpos/components/tooltip';
import type { EngineRecord } from '@wcpos/query';

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
import { DisplayOptions } from './display-options';
import { CouponRow as CoarseRow } from './row';
import { DateCell } from './cells/date';
import { ManagementBar } from '../components/management-bar';
import { useT } from '../../../contexts/translations';
import { useProAccess } from '../contexts/pro-access';
import { CapabilityTooltipTrigger } from '../components/capability-tooltip';
import { DataTable } from '../components/data-table/v2';
import { DataTableSkeleton } from '../components/data-table/v2/skeleton';
import { QuerySearchInput } from '../components/query-search-input';
import { useUISettings } from '../contexts/ui-settings';
import { useMutation } from '../hooks/mutations/use-mutation';
import { useUserCapabilities } from '../hooks/use-user-capabilities';
import {
	QueryStateProvider,
	useCollectionBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { QueryStateActions, QueryStateOf } from '../../../query';
import type { SortFieldsByCollection } from '../../../query/query-state-types';

type CouponRow = { record: EngineRecord<'coupons'> };

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
const DEFAULT_COUPON_SORT = {
	field: 'date_created_gmt',
	direction: 'desc',
} as const;

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

function CouponsList({ binding }: { binding: ReturnType<typeof useCollectionBinding<'coupons'>> }) {
	const state = useQueryState<'coupons'>();
	const actions = useQueryStateActions<'coupons'>();
	const result = useObservableSuspense(binding.resource);
	const deferredResult = React.useDeferredValue(result);
	const pending = deferredResult.searchState === 'pending' && deferredResult.hits.length > 0;
	const emptyStore = !state.search && Object.keys(state.filters).length === 0;
	const pointer = usePointer();
	const t = useT();
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
	const { patch } = useMutation({ collectionName: 'coupons' });

	const tableConfig = React.useMemo(
		() => ({
			meta: {
				onChange: ({
					document,
					changes,
				}: {
					document: EngineRecord<'coupons'>;
					changes: Record<string, unknown>;
				}) => {
					void patch({ document, data: changes });
				},
			},
		}),
		[patch]
	);

	return (
		<>
			{pending && <View testID="coupons-searching-line" className="bg-primary h-0.5" />}
			<View className={`flex-1 ${pending ? 'opacity-60' : ''}`}>
				<DataTable<CouponRow>
					id="coupons"
					collectionName="coupons"
					binding={binding}
					resource={binding.resource}
					sort={state.sort}
					actions={tableActions}
					active$={binding.active$}
					total$={binding.total$}
					sync={binding.sync}
					cells={cells}
					estimatedItemSize={56}
					tableConfig={tableConfig}
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
							title={t(emptyStore ? 'coupons.no_coupons_yet' : 'coupons.nothing_matches_filters')}
							description={emptyStore ? t('coupons.no_coupons_yet_description') : undefined}
							action={
								emptyStore
									? undefined
									: {
											label: t('coupons.clear_filters'),
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

function CouponsScreenContent() {
	const state = useQueryState<'coupons'>();
	const binding = useCollectionBinding('coupons', state);
	const t = useT();
	const router = useRouter();
	const { bottom } = useSafeAreaInsets();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	return (
		<View
			testID="screen-coupons"
			className="bg-background flex-1"
			style={{ paddingBottom: bottom || undefined }}
		>
			<ManagementBar
				title={t('common.coupons')}
				testID="coupons-bar"
				search={
					<QuerySearchInput
						collectionName="coupons"
						placeholder={t('common.search_coupons')}
						testID="search-coupons"
					/>
				}
			>
				<Tooltip showOnNative={readOnly || !caps.canCreateCoupons}>
					<CapabilityTooltipTrigger>
						<IconButton
							testID="coupons-add-button"
							name="plus"
							onPress={() => router.push({ pathname: '/coupons/add' })}
							disabled={readOnly || !caps.canCreateCoupons}
						/>
					</CapabilityTooltipTrigger>
					<TooltipContent>
						<Text>
							{readOnly
								? t('common.upgrade_to_pro')
								: !caps.canCreateCoupons
									? t('capability_hints.create_coupons_admin_path')
									: t('coupons.add_coupon')}
						</Text>
					</TooltipContent>
				</Tooltip>
				<DisplayOptions />
			</ManagementBar>
			<ErrorBoundary>
				<FilterBar />
			</ErrorBoundary>
			<ErrorBoundary>
				<Suspense fallback={<DataTableSkeleton id="coupons" />}>
					<CouponsList binding={binding} />
				</Suspense>
			</ErrorBoundary>
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
