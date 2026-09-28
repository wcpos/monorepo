import * as React from 'react';
import { View } from 'react-native';

import { useLocalSearchParams, useRouter } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StoreDocument } from '@wcpos/database';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';

import { useAppInfo } from '../../../hooks/use-app-info';
import { useT } from '../../../contexts/translations';
import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';
import { UpgradeNotice } from '../components/header/upgrade-notice';
import { UpgradeNoticeContext } from '../components/header/upgrade-notice-context';
import { useRegisterBinding } from '../../../services/register/use-register-binding';
import {
	calendarDate,
	resolveDayTimezone,
	storeDayBounds,
	useStoreDay,
	zoneOptions,
} from '../../../hooks/use-store-day';
import { HeaderLeft } from '../components/header/left';
import { Bar, CashierButton } from './bar';
import { DateButton } from './date-button';
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
import { clampClosureScope, type ClosureScope } from './closures/use-closure-rows';

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

function ReportsScreenContent({ onRoomChange }: { onRoomChange: (room: string) => void }) {
	const t = useT();
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	const binding = useCollectionBinding('orders', state);
	const storeId = Number.isFinite(Number(state.filters.store))
		? Number(state.filters.store)
		: undefined;
	const { presets, timezone, rangeToFilter } = useStoreDay(storeId);
	const { wpCredentials, store, site } = useAppState();
	const storesSource = React.useMemo(
		() => wpCredentials?.populate$('stores') ?? of([]),
		[wpCredentials]
	);
	const stores = useObservableState(storesSource, []) as StoreDocument[];
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
		storeId,
		cashier: state.filters.cashier === undefined ? undefined : Number(state.filters.cashier),
	};
	const select = (next: ClosureScope) => {
		const nextStoreId = next.storeId ?? storeId;
		const nextStore =
			nextStoreId === undefined || nextStoreId === store?.id
				? store
				: stores.find((row) => row.id === nextStoreId);
		// A store switch must use the new zone before the query rerenders useStoreDay.
		const { timezone: nextZone } = resolveDayTimezone(nextStore, site);
		const dayBounds = (value: string) => storeDayBounds(calendarDate(parseISO(value)), nextZone);
		actions.setFilter(
			'dateRange',
			rangeToFilter({
				from: dayBounds(next.from).from,
				to: dayBounds(next.to).to,
			})
		);
		actions.setFilter('register', next.registerId || undefined);
		actions.setFilter(
			'store',
			next.storeId === undefined ? state.filters.store : String(next.storeId || 'woocommerce-pos')
		);
		actions.setFilter('cashier', next.cashier === undefined ? undefined : String(next.cashier));
	};
	return (
		<>
			<Bar room="sales" onBack={() => onRoomChange('sales')} scope={scope} onScopeChange={select} />
			<View
				testID="reports-scope-row"
				className="flex-row items-center justify-between gap-2 px-4 py-2"
			>
				<DateButton
					scope={scope}
					onScopeChange={select}
					storeId={scope.storeId}
					lockedScopeName={t('reports.earlier_days')}
				/>
				<Button
					testID="reports-closures-link"
					variant="ghost"
					className="min-h-12 flex-row items-center gap-1"
					onPress={() => onRoomChange('closures')}
				>
					<ButtonText>{t('reports.closures')}</ButtonText>
					<Icon name="chevronRight" />
				</Button>
			</View>
			<View className="min-h-0 flex-1">
				<Suspense>
					<ReportsProvider binding={binding}>
						<Reports />
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
	const binding = useRegisterBinding();
	const { license } = useAppInfo();
	const { presets, rangeToFilter, timezone } = useStoreDay();
	const cashierScopeID = String(wpCredentials?.id);
	const storeScopeID = store?.id ? String(store.id) : 'woocommerce-pos';
	// Free sees today only, so its query is keyed by the store day and re-keyed at the store's
	// midnight: left open overnight, the page must not keep serving yesterday behind locked controls.
	const storeToday = format(presets().today.from, 'yyyy-MM-dd', zoneOptions(timezone));
	const [, rollover] = React.useReducer((n: number) => n + 1, 0);
	// The timer is an external system: it fires once at the end of the store day to re-render.
	React.useEffect(() => {
		if (license?.isPro) return;
		const wait = Math.max(1_000, presets().today.to.getTime() - Date.now() + 1_000);
		const id = setTimeout(rollover, wait);
		return () => clearTimeout(id);
	}, [license?.isPro, presets, storeToday]);
	const initialFilters: Partial<FiltersOf<'orders'>> = {
		status: 'completed',
		...(!license?.isPro && { register: binding.registerId || 'unbound' }),
		dateRange: rangeToFilter(presets().today),
		cashier: cashierScopeID,
		store: storeScopeID,
	};
	const initialSort = getInitialReportSort(uiSettings.sortBy, uiSettings.sortDirection);

	return (
		<QueryStateProvider
			// The plan is part of the key: a licence that drops to Free remounts the query on
			// today and the bound register instead of keeping a Pro-chosen scope alive.
			key={`${cashierScopeID}:${storeScopeID}:${license?.isPro ? 'pro' : `free:${binding.registerId || 'unbound'}:${storeToday}`}`}
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
	const t = useT();
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);
	const { top } = useSafeAreaInsets();
	const router = useRouter();
	const params = useLocalSearchParams<{
		closureId?: string;
		businessDay?: string;
		openedAt?: string;
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
		(params.openedAt
			? format(convertUTCStringToLocalDate(params.openedAt), 'yyyy-MM-dd', zoneOptions(timezone))
			: today);
	const lockedClosure = !!params.closureId && !license?.isPro && closureDay !== today;
	const initialScope = clampClosureScope(
		{
			from: license?.isPro ? closureDay : today,
			to: license?.isPro ? closureDay : today,
			registerId: (license?.isPro && params.registerId) || binding.registerId || 'unbound',
			storeId: store?.id,
			cashier: room === 'sales' ? wpCredentials?.id : undefined,
		},
		today
	);
	const outsideHistory = !!params.closureId && !!license?.isPro && initialScope.from !== closureDay;
	const scope = license?.isPro
		? (selection ?? initialScope)
		: { ...initialScope, cashier: selection?.cashier };
	return (
		// The safe-area inset sits above everything, so the Free strip never slides under the status bar.
		<View className="flex-1" style={{ paddingTop: top }}>
			{showUpgrade && !license?.isPro && <UpgradeNotice setShowUpgrade={setShowUpgrade} />}
			<ErrorBoundary>
				<Suspense>
					{room === 'sales' ? (
						<SalesScreen onRoomChange={setRoom} />
					) : (
						<>
							<Bar
								room="closures"
								onBack={() => setRoom('sales')}
								scope={scope}
								onScopeChange={setSelection}
							/>
							<View
								testID="reports-scope-row"
								className="flex-row items-center justify-between gap-2 px-4 py-2"
							>
								<DateButton
									scope={scope}
									onScopeChange={setSelection}
									storeId={scope.storeId}
									lockedScopeName={t('reports.earlier_closures')}
									initialLockedPeriod={lockedClosure}
									initialHistoryLimit={outsideHistory}
								/>
								<CashierButton scope={scope} onScopeChange={setSelection} />
							</View>
							<Closures
								scope={scope}
								initialClosureId={lockedClosure || outsideHistory ? undefined : params.closureId}
								onClose={() => router.setParams({ closureId: undefined })}
							/>
						</>
					)}
				</Suspense>
			</ErrorBoundary>
		</View>
	);
}

export function ReportsScreen() {
	const { top } = useSafeAreaInsets();
	const { closureId } = useLocalSearchParams<{ closureId?: string }>();
	// Clearing a consumed link keeps the current room; a new link resets its selection.
	const [link, setLink] = React.useState({ closureId, key: 0 });
	if (link.closureId !== closureId) {
		setLink({ closureId, key: closureId ? link.key + 1 : link.key });
	}
	const { wpCredentials } = useAppState();
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const t = useT();
	return !capabilities || capabilities.includes('view_woocommerce_pos_reports') ? (
		<ReportsShell key={link.key} />
	) : (
		<View className="flex-1" style={{ paddingTop: top + 8 }}>
			<View className="bg-sidebar self-start rounded-md p-2">
				<HeaderLeft />
			</View>
			<Text testID="reports-denied">{t('reports.no_access')}</Text>
		</View>
	);
}
