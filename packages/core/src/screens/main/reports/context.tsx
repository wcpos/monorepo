import * as React from 'react';

import {
	addDays,
	differenceInCalendarDays,
	endOfMonth,
	format,
	isSameDay,
	isSameMonth,
	startOfMonth,
	subDays,
	subMonths,
} from 'date-fns';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { startWith } from 'rxjs';

import { wooMetaCarrier } from '@wcpos/sync-core';
import type { EngineRecord } from '@wcpos/query';
import { observeEngineQuery, useDocField, useQueryRuntime } from '@wcpos/query';

import {
	calendarDate,
	inZone,
	useStoreDay,
	useViewedStore,
	zoneOptions,
} from '../../../hooks/use-store-day';
import { calculateTotals } from './report/utils';
import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';
import { useQueryState } from '../../../query';

import type { RowSelectionState } from '@tanstack/react-table';
import type { useCollectionBinding } from '../../../query';

export interface DateRange {
	start: Date;
	end: Date;
}

/** Order wire payload plus the engine identity used by the report table selection. */
export type OrderPayload = EngineRecord<'orders'>['payload'];
export type ReportOrder = OrderPayload & {
	uuid: EngineRecord<'orders'>['uuid'];
};

export type RefundRow = EngineRecord<'refunds'>['payload'] & { parentNumber?: string };

/** The query binding. Changes only when the provider is handed a new one. */
export interface ReportsBinding {
	binding: ReturnType<typeof useCollectionBinding<'orders'>>;
	comparisonBinding: ReturnType<typeof useCollectionBinding<'orders'>>;
	refundsBinding: ReturnType<typeof useCollectionBinding<'refunds'>>;
}

/** Row selection state. Changes when the cashier ticks a row. */
export interface ReportsSelection {
	unselectedRowIds: RowSelectionState;
	setUnselectedRowIds: React.Dispatch<React.SetStateAction<RowSelectionState>>;
}

/** The orders themselves. Rebuilt on every query emission. */
export interface ReportsData {
	periodRefunds?: RefundRow[];
	allOrders: ReportOrder[];
	selectedOrders: ReportOrder[];
	dateRange: DateRange;
	comparisonRange: DateRange;
	comparisonOrders: ReportOrder[];
	wholeComparisonOrders: ReportOrder[];
	live: boolean;
	/** The selected orders aggregated once, at the viewed store's precision, for every reader. */
	totals: ReturnType<typeof calculateTotals>;
}

export type DetailId =
	| 'orders'
	| 'payments'
	| 'products'
	| 'categories'
	| 'brands'
	| 'cashiers'
	| 'taxes'
	| 'refunds'
	| 'channels'
	| 'registers';

export interface ReportsScope {
	detail: DetailId | null;
	setDetail: React.Dispatch<React.SetStateAction<DetailId | null>>;
	chartView: 'hour' | 'run';
	setChartView: React.Dispatch<React.SetStateAction<ReportsScope['chartView']>>;
	cmp: 'yesterday' | 'lastweek';
	setCmp: React.Dispatch<React.SetStateAction<ReportsScope['cmp']>>;
	statusMode: 'done' | 'all';
	setStatusMode: React.Dispatch<React.SetStateAction<ReportsScope['statusMode']>>;
}
const ReportsScopeContext = React.createContext<ReportsScope | undefined>(undefined);
export function ReportsScopeProvider({ children }: React.PropsWithChildren) {
	const [detail, setDetail] = React.useState<DetailId | null>(null);
	const [chartView, setChartView] = React.useState<ReportsScope['chartView']>('hour');
	const [cmp, setCmp] = React.useState<ReportsScope['cmp']>('yesterday');
	const [statusMode, setStatusMode] = React.useState<ReportsScope['statusMode']>('done');
	const value = React.useMemo(
		() => ({ detail, setDetail, cmp, setCmp, statusMode, setStatusMode, chartView, setChartView }),
		[detail, cmp, statusMode, chartView]
	);
	return <ReportsScopeContext.Provider value={value}>{children}</ReportsScopeContext.Provider>;
}
export function useReportsScope() {
	const value = React.useContext(ReportsScopeContext);
	if (!value) throw new Error('useReportsScope must be used within ReportsScopeProvider');
	return value;
}

/** Shared by the two binding requests and the data provider; boundaries are store calendar days. */
export function useReportsPeriod() {
	const { cmp } = useReportsScope();
	const filters = useQueryState<'orders'>().filters;
	const storeId = Number.isFinite(Number(filters.store)) ? Number(filters.store) : undefined;
	const { presets, timezone, dayBounds, rangeToFilter } = useStoreDay(storeId);
	const ranges = presets();
	const today = ranges.today;
	const start = filters.dateRange?.from
		? convertUTCStringToLocalDate(filters.dateRange.from)
		: today.from;
	const end = filters.dateRange?.to ? convertUTCStringToLocalDate(filters.dateRange.to) : today.to;
	const options = zoneOptions(timezone);
	const days = differenceInCalendarDays(end, start, options) + 1;
	// Match DateButton's clamped presets and precedence (Today wins coincident ranges).
	const selected = Object.entries(ranges).find(
		([, range]) =>
			isSameDay(range.from, start, options) &&
			isSameDay(range.to > today.to ? today.to : range.to, end, options)
	)?.[0];
	const period = selected?.endsWith('Month')
		? 'month'
		: selected?.endsWith('Week')
			? 'week'
			: days === 1
				? 'day'
				: days <= 7
					? 'week'
					: 'month';
	const shiftedStart =
		period === 'month'
			? subMonths(start, 1, options)
			: subDays(start, period === 'day' && cmp === 'yesterday' ? 1 : 7, options);
	// A whole calendar month (the 1st to its last day, preset or typed) compares with the whole
	// month before; a running month and any other range start a month earlier and keep their
	// calendar-day count, so a 45-day range compares with 45 days whatever the months' lengths.
	const wholeMonth =
		isSameMonth(start, end, options) &&
		isSameDay(start, startOfMonth(start, options), options) &&
		isSameDay(end, endOfMonth(end, options), options);
	const shiftedEnd =
		period === 'month'
			? wholeMonth
				? endOfMonth(shiftedStart, options)
				: addDays(shiftedStart, days - 1, options)
			: subDays(end, period === 'day' && cmp === 'yesterday' ? 1 : 7, options);
	const from = dayBounds(calendarDate(inZone(timezone, shiftedStart))).from;
	const to = dayBounds(calendarDate(inZone(timezone, shiftedEnd))).to;
	return {
		dateRange: { start, end },
		comparisonRange: { start: from, end: to },
		comparisonFilter: rangeToFilter({ from, to }),
		live: period === 'day' && isSameDay(start, today.from, options),
		period,
		timezone,
		storeId,
	};
}
const includedStatus = (order: { status?: string }, mode: ReportsScope['statusMode']) =>
	['completed', 'processing', ...(mode === 'all' ? ['pending', 'on-hold'] : [])].includes(
		order.status ?? ''
	);
/** The status set as a predicate, for the table's selection to agree with the figures. */
export function useIncludedStatus() {
	const { statusMode } = useReportsScope();
	return React.useCallback(
		(order: { status?: string }) => includedStatus(order, statusMode),
		[statusMode]
	);
}

/**
 * Split three ways along how often each part changes.
 *
 * `allOrders` and `selectedOrders` are rebuilt on every order-query emission, and the whole
 * bundle was republished with them — so `ReportsSyncProgress`, which reads nothing but
 * `binding`, re-rendered on every emission and on every row the cashier ticked.
 *
 * There is deliberately NO combined context here. Every consumer takes exactly the slice it
 * uses; a combined `useReports()` would be surface with no callers, and the only thing it
 * could do is put back the coupling this split removes.
 */
const ReportsBindingContext = React.createContext<ReportsBinding | undefined>(undefined);
const ReportsSelectionContext = React.createContext<ReportsSelection | undefined>(undefined);
const ReportsDataContext = React.createContext<ReportsData | undefined>(undefined);

/** Just the binding — stable across order emissions and selection changes. */
export const useReportsBinding = (): ReportsBinding => {
	const context = React.useContext(ReportsBindingContext);
	if (!context) {
		throw new Error('useReportsBinding must be used within a ReportsContext');
	}
	return context;
};

/** Just the row selection. */
export const useReportsSelection = (): ReportsSelection => {
	const context = React.useContext(ReportsSelectionContext);
	if (!context) {
		throw new Error('useReportsSelection must be used within a ReportsContext');
	}
	return context;
};

/** The orders and the date range they were filtered by. */
export const useReportsData = (): ReportsData => {
	const context = React.useContext(ReportsDataContext);
	if (!context) {
		throw new Error('useReportsData must be used within a ReportsContext');
	}
	return context;
};

interface ReportsProviderProps {
	binding: ReturnType<typeof useCollectionBinding<'orders'>>;
	comparisonBinding: ReturnType<typeof useCollectionBinding<'orders'>>;
	refundsBinding: ReturnType<typeof useCollectionBinding<'refunds'>>;
	children: React.ReactNode;
}

/**
 *
 */
export function ReportsProvider({
	binding,
	comparisonBinding,
	refundsBinding,
	children,
}: ReportsProviderProps) {
	const result = useObservableSuspense(binding.resource);
	const { dateRange, comparisonRange, live } = useReportsPeriod();
	const { statusMode } = useReportsScope();
	const [unselectedRowIds, setUnselectedRowIds] = React.useState<RowSelectionState>({});

	/**
	 *
	 */
	const allOrders = React.useMemo(
		() =>
			result.hits.map((hit) => {
				const record = hit.record as EngineRecord<'orders'>;
				return { ...record.payload, uuid: record.uuid };
			}),
		[result.hits]
	);

	/**
	 * Remove unselectedRowIds from orders
	 */
	const selectedOrders = React.useMemo(
		() =>
			allOrders.filter(
				(order) => includedStatus(order, statusMode) && !unselectedRowIds[order.uuid]
			),
		[allOrders, statusMode, unselectedRowIds]
	);
	const bindingValue = React.useMemo<ReportsBinding>(
		() => ({ binding, comparisonBinding, refundsBinding }),
		[binding, comparisonBinding, refundsBinding]
	);

	const selectionValue = React.useMemo<ReportsSelection>(
		() => ({ unselectedRowIds, setUnselectedRowIds }),
		[unselectedRowIds]
	);

	// One aggregation for the hero, both print actions and both document renderers.
	const { storeId } = useReportsPeriod();
	const numDecimals = useDocField(useViewedStore(storeId), (value) => value.price_num_decimals);
	const totals = React.useMemo(
		() => calculateTotals({ orders: selectedOrders, num_decimals: numDecimals }),
		[selectedOrders, numDecimals]
	);
	const dataValue = React.useMemo<ReportsData>(
		() => ({
			allOrders,
			selectedOrders,
			dateRange,
			comparisonRange,
			live,
			comparisonOrders: [],
			wholeComparisonOrders: [],
			totals,
		}),
		[allOrders, selectedOrders, dateRange, comparisonRange, live, totals]
	);

	return (
		<ReportsBindingContext.Provider value={bindingValue}>
			<ReportsSelectionContext.Provider value={selectionValue}>
				<ReportsDataContext.Provider value={dataValue}>{children}</ReportsDataContext.Provider>
			</ReportsSelectionContext.Provider>
		</ReportsBindingContext.Provider>
	);
}

/** Mount only inside a differences-only Suspense boundary: the current figure never suspends. */
export function ReportsComparison({ children }: React.PropsWithChildren) {
	const data = useReportsData();
	const { comparisonBinding } = useReportsBinding();
	const { statusMode } = useReportsScope();
	const { timezone, period, storeId } = useReportsPeriod();
	const { presets } = useStoreDay(storeId);
	const result = useObservableSuspense(comparisonBinding.resource);
	const wholeComparisonOrders = result.hits
		.map(({ record }) => {
			const order = record as EngineRecord<'orders'>;
			return { ...order.payload, uuid: order.uuid };
		})
		.filter((order) => includedStatus(order, statusMode));
	const clock = (date: Date) => format(inZone(timezone, date), 'HH:mm:ss.SSS');
	// A live day's cutoff moves with the clock, once a minute while a day is shown; the day
	// stops being live at the store's midnight, when the whole comparison day counts.
	const [tick, setTick] = React.useState(() => Date.now());
	React.useEffect(() => {
		if (period !== 'day') return;
		const id = setInterval(() => setTick(Date.now()), 60_000);
		return () => clearInterval(id);
	}, [period]);
	const now = clock(new Date(tick));
	// `presets()` reads the clock; the minute tick above is what makes this render again.
	const live =
		period === 'day' &&
		isSameDay(data.dateRange.start, presets().today.from, zoneOptions(timezone));
	const comparisonOrders = live
		? wholeComparisonOrders.filter(
				(order) =>
					order.date_created_gmt &&
					clock(convertUTCStringToLocalDate(order.date_created_gmt)) <= now
			)
		: wholeComparisonOrders;
	return (
		<ReportsDataContext.Provider value={{ ...data, live, comparisonOrders, wholeComparisonOrders }}>
			{children}
		</ReportsDataContext.Provider>
	);
}

/** A secondary read: parent lookup is local-only and never expands the sales demand. */
export function ReportsRefunds({ children }: React.PropsWithChildren) {
	const data = useReportsData();
	const { refundsBinding } = useReportsBinding();
	const { unselectedRowIds } = useReportsSelection();
	const { filters } = useQueryState<'orders'>();
	const result = useObservableSuspense(refundsBinding.resource);
	const refunds = result.hits.map(({ record }) => (record as EngineRecord<'refunds'>).payload);
	const { engine, locale } = useQueryRuntime();
	const parentIds = [
		...new Set(
			result.hits.map(({ record }) => (record as EngineRecord<'refunds'>).payload.parent_id)
		),
	]
		.sort((a, b) => a - b)
		.join(',');
	const source = React.useMemo(
		() =>
			observeEngineQuery(engine, {
				collection: 'orders',
				selector: { id: { $in: parentIds ? parentIds.split(',').map(Number) : [] } },
				limit: Number.MAX_SAFE_INTEGER,
			}).pipe(startWith(undefined)),
		[engine, locale, parentIds]
	);
	const local = useObservableState(source);
	const parents = new Map([
		...(local?.hits.map(({ record }) => {
			const order = record as EngineRecord<'orders'>;
			return [order.payload.id, { ...order.payload, uuid: order.uuid }] as const;
		}) ?? []),
		...data.allOrders.map((order) => [order.id, order] as const),
	]);
	const held = new Set(data.allOrders.map((order) => order.id));
	const periodRefunds =
		local &&
		refunds.flatMap((refund) => {
			const parent = parents.get(refund.parent_id);
			if (parent && unselectedRowIds[parent.uuid]) return [];
			const identity = wooMetaCarrier.readIdentity((parent ?? refund).meta_data);
			const inRoom =
				held.has(refund.parent_id) ||
				((!filters.store ||
					(!filters.register && parent && parent.created_via !== 'woocommerce-pos') ||
					(parent && !/^\d+$/.test(String(filters.store))
						? parent.created_via === filters.store
						: identity.storeId ===
							String(filters.store === 'woocommerce-pos' ? 0 : filters.store))) &&
					(!filters.register || identity.registerId === filters.register) &&
					(!filters.cashier || identity.cashierId === String(filters.cashier)));
			return inRoom ? [{ ...refund, parentNumber: parent?.number }] : [];
		});
	return (
		<ReportsDataContext.Provider value={{ ...data, periodRefunds }}>
			{children}
		</ReportsDataContext.Provider>
	);
}
