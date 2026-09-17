import * as React from 'react';
import { View } from 'react-native';

import { useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';

import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { useAppInfo } from '../../../hooks/use-app-info';
import { useT } from '../../../contexts/translations';
import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';
import { withProAccess } from '../components/pro-guard';
import { useRegisterBinding } from '../../../services/register/use-register-binding';
import { calendarDate, useStoreDay, zoneOptions } from '../../../hooks/use-store-day';
import { HeaderLeft } from '../components/header/left';
import { PageBar } from './page-bar';
import { Closures } from './closures';
import { ReportsProvider } from './context';
import { Reports } from './reports';
import { useAppState } from '../../../contexts/app-state';
import { useUISettings } from '../contexts/ui-settings';
import {
	QueryStateProvider,
	useCollectionBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { ClosureScope } from './closures/use-closure-rows';
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

const GuardedReports = withProAccess(Reports, 'reports');
function ReportsScreenContent({ onRoomChange }: { onRoomChange: (room: string) => void }) {
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	const binding = useCollectionBinding('orders', state);
	const { presets, timezone, dayBounds, rangeToFilter } = useStoreDay();
	const range = state.filters.dateRange;
	const day = (value: string | undefined, fallback: Date) =>
		format(
			value ? convertUTCStringToLocalDate(value) : fallback,
			'yyyy-MM-dd',
			zoneOptions(timezone)
		);
	const scope = {
		from: day(range?.from, presets().today.from),
		to: day(range?.to, presets().today.to),
		registerId: state.filters.register ?? '',
		storeId: Number.isFinite(Number(state.filters.store)) ? Number(state.filters.store) : undefined,
		cashier: state.filters.cashier === undefined ? undefined : Number(state.filters.cashier),
	};
	const select = (next: ClosureScope) => {
		actions.setFilter(
			'dateRange',
			rangeToFilter({
				from: dayBounds(calendarDate(parseISO(next.from))).from,
				to: dayBounds(calendarDate(parseISO(next.to))).to,
			})
		);
		actions.setFilter('register', next.registerId || undefined);
		actions.setFilter(
			'store',
			next.storeId === undefined ? state.filters.store : String(next.storeId)
		);
		actions.setFilter('cashier', next.cashier === undefined ? undefined : String(next.cashier));
	};
	return (
		<>
			<PageBar room="sales" onRoomChange={onRoomChange} scope={scope} onScopeChange={select} />
			<View className="min-h-0 flex-1">
				<Suspense>
					<ReportsProvider binding={binding}>
						<GuardedReports />
					</ReportsProvider>
				</Suspense>
			</View>
		</>
	);
}

/**
 *
 */
function SalesScreen({ onRoomChange }: { onRoomChange: (room: string) => void }) {
	const { uiSettings } = useUISettings('reports-orders');
	const { wpCredentials, store } = useAppState();
	const { presets, rangeToFilter } = useStoreDay();
	const cashierScopeID = String(wpCredentials?.id);
	const storeScopeID = store?.id ? String(store.id) : 'woocommerce-pos';
	const initialFilters: Partial<FiltersOf<'orders'>> = {
		status: 'completed',
		dateRange: rangeToFilter(presets().today),
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
					<ReportsScreenContent onRoomChange={onRoomChange} />
				</Suspense>
			</ErrorBoundary>
		</QueryStateProvider>
	);
}

function ReportsShell() {
	const params = useLocalSearchParams<{
		closureId?: string;
		businessDay?: string;
		closedAt?: string;
		registerId?: string;
	}>();
	const [room, setRoom] = React.useState(params.closureId ? 'closures' : 'sales');
	const [selection, setSelection] = React.useState<ClosureScope | null>(null);
	const { store, wpCredentials } = useAppState();
	const binding = useRegisterBinding();
	const { presets, timezone } = useStoreDay();
	const today = format(presets().today.from, 'yyyy-MM-dd', zoneOptions(timezone));
	const { license } = useAppInfo();
	const closureDay =
		params.businessDay ??
		(params.closedAt
			? format(new Date(params.closedAt), 'yyyy-MM-dd', zoneOptions(timezone))
			: today);
	const initialScope = {
		from: license?.isPro ? closureDay : today,
		to: license?.isPro ? closureDay : today,
		registerId: (license?.isPro && params.registerId) || binding.registerId || 'unbound',
		storeId: store?.id,
		cashier: room === 'sales' ? wpCredentials?.id : undefined,
	};
	const scope = license?.isPro
		? (selection ?? initialScope)
		: { ...initialScope, cashier: selection?.cashier };
	return (
		<View className="flex-1">
			<ErrorBoundary>
				<Suspense>
					{room === 'sales' ? (
						<SalesScreen onRoomChange={setRoom} />
					) : (
						<>
							<PageBar
								room={room}
								onRoomChange={setRoom}
								scope={scope}
								onScopeChange={setSelection}
							/>
							<Closures scope={scope} initialClosureId={params.closureId} />
						</>
					)}
				</Suspense>
			</ErrorBoundary>
		</View>
	);
}

export function ReportsScreen() {
	const { closureId } = useLocalSearchParams<{ closureId?: string }>();
	const { wpCredentials } = useAppState();
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const t = useT();
	return capabilities?.includes('view_woocommerce_pos_reports') ? (
		<ReportsShell key={closureId} />
	) : (
		<View className="flex-1">
			<View className="bg-sidebar self-start rounded-md p-2">
				<HeaderLeft />
			</View>
			<Text testID="reports-denied">{t('reports.no_access')}</Text>
		</View>
	);
}
