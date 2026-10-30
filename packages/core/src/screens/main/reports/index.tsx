import * as React from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { filter, of } from 'rxjs';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format } from 'date-fns/format';
import { parseISO } from 'date-fns/parseISO';
import { useObservableState } from 'observable-hooks';

import { observeCredentialStores, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';
import type { ClosureRow } from '@wcpos/query/register-session';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { PortalHost } from '@wcpos/components/portal';
import { registerPortalContainer } from '@wcpos/components/lib/portal-container';
import { useIsPhone } from '@wcpos/components/lib/device';
import { cn } from '@wcpos/components/lib/utils';
import type { SortFieldsByCollection } from '@wcpos/query/query-state';
import { useGround } from '@wcpos/components/lib/ground';

import { useAppInfo } from '../../../hooks/use-app-info';
import { useT } from '../../../contexts/translations';
import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';
import { useRegisterBinding } from '../../../services/register/use-register-binding';
import {
	calendarDate,
	resolveDayTimezone,
	storeDayBounds,
	useStoreDay,
	zoneOptions,
} from '../../../hooks/use-store-day';
import { ManagementBar } from '../components/management-bar';
import { Bar, ClosuresCashierChip } from './bar';
import { ScopeRow } from './scope-row';
import { DateButton } from './date-button';
import { TillStrip } from './till-strip';
import { Closures } from './closures';
import { ClosurePanel } from './closures/closure-panel';
import { ReportsProvider, ReportsRefunds, ReportsScopeProvider, useReportsPeriod } from './context';
import { HeroShell, SalesScope } from './hero';
import { Reports } from './reports';
import { useAppState } from '../../../contexts/app-state';
import { useUISettings } from '../contexts/ui-settings';
import {
	QueryStateProvider,
	useCollectionQueryHandle,
	useQueryState,
	useQueryStateActions,
} from '../../../query';
import { clampClosureScope, type ClosureScope, useLocalClosure } from './closures/use-closure-rows';

import type { FiltersOf, QueryStateOf } from '../../../query';

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

type SalesScreenProps = {
	hasRoom: boolean;
	onRoomChange: (room: string) => void;
	onOpenClosure: (closure: ClosureRow) => void;
	/** A page in the Sales page's place, under the bar: the phone's Free closure pane. */
	page?: React.ReactNode;
};

function ReportsScreenContent({ hasRoom, onRoomChange, onOpenClosure, page }: SalesScreenProps) {
	const router = useRouter();
	const t = useT();
	const ground = useGround();
	const state = useQueryState<'orders'>();
	const actions = useQueryStateActions<'orders'>();
	// The three handles are owned here (the effects retain them), above the refunds and
	// comparison boundaries, so a suspended or failed secondary read never drops a handle. A
	// failed sales read goes to the screen's boundary above this owner; its reset remounts the
	// owner, which reads afresh.
	const handle = useCollectionQueryHandle('orders', state, { storeScope: 'sales' });
	const { comparisonFilter } = useReportsPeriod();
	// A handle is keyed by the state's canonical JSON, so an equal state is the same handle even
	// unmemoised; the memo only saves building the key on every render.
	const { from: comparisonFrom, to: comparisonTo } = comparisonFilter;
	const comparisonState = React.useMemo(
		() => ({
			...state,
			filters: { ...state.filters, dateRange: { from: comparisonFrom, to: comparisonTo } },
		}),
		[state, comparisonFrom, comparisonTo]
	);
	const comparisonHandle = useCollectionQueryHandle('orders', comparisonState, {
		storeScope: 'sales',
	});
	const {
		search,
		limit,
		filters: { dateRange },
	} = state;
	const refundsState = React.useMemo<QueryStateOf<'refunds'>>(
		() => ({
			search,
			limit,
			sort: { field: 'date_created_gmt', direction: 'desc' },
			filters: { dateRange },
		}),
		[search, limit, dateRange]
	);
	const refundsHandle = useCollectionQueryHandle('refunds', refundsState);
	const storeId = Number.isFinite(Number(state.filters.store))
		? Number(state.filters.store)
		: undefined;
	const { presets, timezone, rangeToFilter } = useStoreDay(storeId);
	const { wpCredentials, store, site } = useAppState();
	const storesSource = React.useMemo(
		() =>
			wpCredentials
				? observeCredentialStores(wpCredentials).pipe(
						filter((value) => value !== PENDING_USER_DB_READ)
					)
				: of([]),
		[wpCredentials]
	);
	const stores = useObservableState(storesSource, []);
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
	const date = (
		<DateButton
			scope={scope}
			onScopeChange={select}
			storeId={scope.storeId}
			lockedScopeName={t('reports.earlier_days')}
		/>
	);
	const strip = (
		<TillStrip
			onOpenClosures={hasRoom ? () => onRoomChange('closures') : undefined}
			onOpenClosure={onOpenClosure}
		/>
	);
	// The Free pane portals into the `reports` host, which the settled page owns; while the first
	// orders load, the fallback holds the host so the pane is never homeless (CodeRabbit, #3058).
	const registerContainer = React.useCallback((node: ViewInstance | null) => {
		registerPortalContainer(
			'reports',
			Platform.OS === 'web' ? (node as unknown as HTMLElement) : null
		);
	}, []);
	return (
		<>
			<Bar room="sales" onBack={() => onRoomChange('sales')} scope={scope} onScopeChange={select} />
			<View className="min-h-0 flex-1">
				{/* The date button stays available while the first orders load: it is the only way out
				    of a slow or stuck range, so the loading shell carries the same scope row. A later
				    query keeps the previous figures until it answers (the provider's drawn handle).
				    The till strip scrolls with the page as its first row (owner, 2026-10-18), outside
				    the date: it always shows the till now, and is the way into Closures. */}
				{page ?? (
					<Suspense
						fallback={
							// The same scrolling shell as the settled page: on a short phone the strip
							// can push the date button below the fold (Codex, #2720).
							<View ref={registerContainer} className="min-h-0 flex-1">
								<ScrollView className="flex-1" contentContainerClassName={cn(ground.gap, ground.p)}>
									{strip}
									<SalesScope date={date} settled={false} />
									<HeroShell />
								</ScrollView>
								<PortalHost name="reports" />
							</View>
						}
					>
						<ReportsProvider
							handle={handle}
							comparisonHandle={comparisonHandle}
							refundsHandle={refundsHandle}
						>
							<ErrorBoundary
								FallbackComponent={() => <Reports date={date} header={strip} />}
								resetKeys={[refundsHandle, handle]}
								// A new sales query can leave the failed refunds handle in place: the
								// reset asks the engine again rather than rethrowing the old failure.
								onReset={() => refundsHandle.retry()}
							>
								<React.Suspense fallback={<Reports date={date} header={strip} />}>
									<ReportsRefunds>
										<Reports date={date} header={strip} />
									</ReportsRefunds>
								</React.Suspense>
							</ErrorBoundary>
						</ReportsProvider>
					</Suspense>
				)}
			</View>
		</>
	);
}

/**
 *
 */
function SalesScreen({ hasRoom, onRoomChange, onOpenClosure, page }: SalesScreenProps) {
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
		...(!license?.isPro && { register: binding.registerId || 'unbound' }),
		dateRange: rangeToFilter(presets().today),
		store: storeScopeID,
	};
	const initialSort = getInitialReportSort(uiSettings.sortBy, uiSettings.sortDirection);

	return (
		<QueryStateProvider
			// The plan is part of the key: a licence that drops to Free remounts the query on
			// today and the bound register instead of keeping a Pro-chosen scope alive.
			key={`${cashierScopeID}:${storeScopeID}:${license?.isPro ? 'pro' : `free:${binding.registerId || 'unbound'}:${storeToday}:${timezone}`}`}
			collection="orders"
			initialPageSize={REPORTS_ALL_RESULTS_LIMIT}
			initialSort={initialSort}
			initialFilters={initialFilters}
		>
			<ErrorBoundary>
				<Suspense>
					<ReportsScopeProvider>
						<ReportsScreenContent
							hasRoom={hasRoom}
							onRoomChange={onRoomChange}
							onOpenClosure={onOpenClosure}
							page={page}
						/>
					</ReportsScopeProvider>
				</Suspense>
			</ErrorBoundary>
		</QueryStateProvider>
	);
}

function ReportsShell({
	pressed,
	onOpenClosure,
}: {
	pressed: ClosureRow | null;
	onOpenClosure: (closure: ClosureRow) => void;
}) {
	const t = useT();
	const phone = useIsPhone();
	const ground = useGround();
	const router = useRouter();
	const params = useLocalSearchParams<{
		closureId?: string;
		businessDay?: string;
		openedAt?: string;
		registerId?: string;
	}>();
	const { license } = useAppInfo();
	const hasRoom = !!license?.isPro;
	const [room, setRoom] = React.useState(hasRoom && params.closureId ? 'closures' : 'sales');
	if (!hasRoom && room === 'closures') setRoom('sales');
	const onRoomChange = (next: string) => {
		if (next !== 'closures' || hasRoom) setRoom(next);
	};
	const held = !hasRoom && pressed && pressed.id === params.closureId ? pressed : null;
	const local = useLocalClosure(hasRoom || held ? undefined : params.closureId);
	const row = held ?? local.row;
	const onClose = () => router.setParams({ closureId: undefined });
	// Consume an unresolved external route so it cannot keep reopening a missing document; a
	// failed read keeps the route, since nothing proved the closure absent.
	React.useEffect(() => {
		if (!hasRoom && params.closureId && !held && local.status === 'missing')
			router.setParams({ closureId: undefined });
	}, [hasRoom, params.closureId, held, local.status, router]);
	const [selection, setSelection] = React.useState<ClosureScope | null>(null);
	const { store, wpCredentials } = useAppState();
	const binding = useRegisterBinding();
	const { presets, timezone } = useStoreDay();
	const today = format(presets().today.from, 'yyyy-MM-dd', zoneOptions(timezone));
	const closureDay = !hasRoom
		? today
		: (params.businessDay ??
			(params.openedAt
				? format(convertUTCStringToLocalDate(params.openedAt), 'yyyy-MM-dd', zoneOptions(timezone))
				: today));
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
	// The phone's pane is a page in the Sales page's place, under the bar that pads the status-bar
	// inset, as the Pro room keeps its bar above its phone pane (Codex, #3058).
	const pane = row && <ClosurePanel key={row.id} row={row} onClose={onClose} />;
	return (
		// Each room's bar pads the safe-area inset and shows the held-session banner and the Free
		// strip under it, as every page bar does.
		<View className="flex-1">
			<ErrorBoundary>
				<Suspense>
					{!(hasRoom && room === 'closures') ? (
						<>
							<SalesScreen
								hasRoom={hasRoom}
								onRoomChange={onRoomChange}
								onOpenClosure={onOpenClosure}
								page={phone ? pane || undefined : undefined}
							/>
							{!phone && pane}
						</>
					) : (
						<>
							<Bar
								room="closures"
								onBack={() => setRoom('sales')}
								scope={scope}
								onScopeChange={setSelection}
							/>
							<Closures
								renderScopeRow={({ actions }) => (
									<View
										// The row under the wide bar brings the page gutter between the bar's
										// controls and its own; the Closures body's `p-gutter` brings the gutter
										// below. The phone keeps its 8 under its control-height bar.
										className={cn(ground.px, phone ? 'py-2' : ground.pt)}
									>
										<ScopeRow
											testID="reports-scope-row"
											date={
												<DateButton
													scope={scope}
													onScopeChange={setSelection}
													storeId={scope.storeId}
													// Re-keyed by plan: a deep link's lock or history hint must not outlive the plan it was computed for.
													key={license?.isPro ? 'pro' : 'free'}
													lockedScopeName={t('reports.earlier_closures')}
													initialHistoryLimit={outsideHistory}
												/>
											}
											chips={<ClosuresCashierChip scope={scope} onScopeChange={setSelection} />}
											actions={actions}
										/>
									</View>
								)}
								scope={scope}
								initialClosureId={outsideHistory ? undefined : params.closureId}
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
	const { closureId } = useLocalSearchParams<{ closureId?: string }>();
	// Clearing a consumed link keeps the current room; a new link resets its selection.
	const [link, setLink] = React.useState({ closureId, key: 0 });
	if (link.closureId !== closureId) {
		setLink({ closureId, key: closureId ? link.key + 1 : link.key });
	}
	// The strip hands over the row it drew, local or the server's: Free opens that row without a
	// local read, so a closure this device never held still opens (CodeRabbit, #3058). It lives
	// above the re-key, which a strip press is.
	const [pressed, setPressed] = React.useState<ClosureRow | null>(null);
	const router = useRouter();
	const openClosure = (closure: ClosureRow) => {
		setPressed(closure);
		router.setParams({
			closureId: closure.id,
			businessDay: closure.business_day,
			openedAt: closure.opened_at,
			registerId: closure.register_id,
		});
	};
	const { wpCredentials } = useAppState();
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const t = useT();
	const ground = useGround();
	return !capabilities || capabilities.includes('view_woocommerce_pos_reports') ? (
		<ReportsShell key={link.key} pressed={pressed} onOpenClosure={openClosure} />
	) : (
		<View className="flex-1">
			<ManagementBar title={t('common.reports')} testID="reports-bar" />
			<Text testID="reports-denied" className={ground.p}>
				{t('reports.no_access')}
			</Text>
		</View>
	);
}
