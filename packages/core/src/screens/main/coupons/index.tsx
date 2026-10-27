import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { EmptyState } from '@wcpos/components/empty-state';
import { usePointer } from '@wcpos/components/lib/device';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent } from '@wcpos/components/tooltip';
import type { EngineRecord, QueryHandle } from '@wcpos/query';
import type { SortFieldsByCollection } from '@wcpos/query/query-state';

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
import { useAppInfo } from '../../../hooks/use-app-info';
import { ListColumn, ListPage } from '../components/list-frame';
import { CapabilityTooltipTrigger } from '../components/capability-tooltip';
import { DataTable } from '../components/data-table';
import { DataTableRow } from '../components/data-table/rows';
import { DataTableSkeleton } from '../components/data-table/skeleton';
import { QuerySearchInput } from '../components/query-search-input';
import { useProAccess } from '../contexts/pro-access';
import { useUISettings } from '../contexts/ui-settings';
import { useCouponRecord } from './commands/use-coupon-record';
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

// The list re-renders for the answer only; the table and the footer read their own fields.
const ANSWER_ONLY: SnapshotFields = [];

function CouponsList({
	handle,
}: {
	/** The coupons query handle (roadmap#423): the list and its table read its snapshot. */
	handle: QueryHandle;
}) {
	const state = useQueryState<'coupons'>();
	const actions = useQueryStateActions<'coupons'>();
	// Suspended on until the first answer (the body's boundary draws the skeleton); a changed
	// query keeps the current rows while the new handle answers (`useDrawnHandle`).
	const shown = useDrawnHandle(handle);
	const { result } = useQuerySnapshot(shown, ANSWER_ONLY);
	const deferredResult = React.useDeferredValue(result);
	const pending = deferredResult.searchState === 'pending' && deferredResult.hits.length > 0;
	const emptyStore = !state.search && Object.keys(state.filters).length === 0;
	const pointer = usePointer();
	const t = useT();
	const router = useRouter();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	// The caret opens the coupon; the row only while the Actions column is hidden.
	const editable = !readOnly && caps.canEditCoupons;
	const open = (uuid: string) =>
		router.push({ pathname: '/coupons/edit/[couponId]', params: { couponId: uuid } });
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
	const { saveCouponChange } = useCouponRecord();

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
					void saveCouponChange(document, changes);
				},
			},
		}),
		[saveCouponChange]
	);

	return (
		<>
			{pending && <View testID="coupons-searching-line" className="bg-primary h-0.5" />}
			<View className={`flex-1 ${pending ? 'opacity-60' : ''}`}>
				<DataTable<CouponRow>
					id="coupons"
					collectionName="coupons"
					handle={handle}
					sort={state.sort}
					actions={tableActions}
					cells={cells}
					estimatedItemSize={56}
					tableConfig={tableConfig}
					renderItem={({ item }) => (
						<VirtualizedList.Item>
							{pointer === 'coarse' ? (
								<View testID={`data-table-row-${item.original.record.uuid}`}>
									<CoarseRow record={item.original.record} />
								</View>
							) : (
								<DataTableRow
									item={item}
									pressWhenActionsHidden={
										editable ? () => open(item.original.record.uuid) : undefined
									}
								/>
							)}
						</VirtualizedList.Item>
					)}
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

/** The list: the part of the page the Free preview overlay covers. */
/** The list's column: the part of the page the Free preview overlay covers. */
function CouponsColumn() {
	const state = useQueryState<'coupons'>();
	const handle = useCollectionQueryHandle('coupons', state);
	return (
		<ListColumn
			testID="coupons-body"
			chips={<FilterBar />}
			handle={handle}
			skeleton={<DataTableSkeleton id="coupons" />}
		>
			<CouponsList handle={handle} />
		</ListColumn>
	);
}

function CouponsScreenContent() {
	const t = useT();
	const router = useRouter();
	// The bar sits outside the guard, so it reads the licence itself.
	const { license } = useAppInfo();
	const readOnly = !(license?.isPro ?? false);
	const { caps } = useUserCapabilities();
	return (
		<ListPage
			testID="screen-coupons"
			pro="coupons"
			bar={
				<ManagementBar
					// No title: the search's placeholder names the page and the rail marks it (owner, 2026-10-18).
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
								accessibilityLabel={t('coupons.add_coupon')}
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
			}
		>
			<CouponsColumn />
		</ListPage>
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
