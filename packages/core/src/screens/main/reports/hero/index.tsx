import * as React from 'react';
import { View } from 'react-native';

import roundTo from 'lodash/round';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { Card } from '@wcpos/components/card';
import { useIsPhone } from '@wcpos/components/lib/device';
import { Chip } from '@wcpos/components/chip';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Button } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';
import { TileGrid } from '@wcpos/components/tile-grid';
import { SegmentedControl } from '@wcpos/components/segmented-control';

import { usePageSheetHost } from '../../components/page-sheet-host';
import { useT } from '../../../../contexts/translations';
import { inZone } from '../../../../hooks/use-store-day';
import { useLocalDate } from '../../../../hooks/use-local-date';
import { useQueryStateActions } from '../../../../query';
import { useReportFormats } from '../use-report-formats';
import { Chart } from '../chart';
import {
	ReportsComparison,
	useIncludedStatus,
	useReportsData,
	useReportsHandles,
	useReportsPeriod,
	useReportsScope,
	useReportsSelection,
} from '../context';
import { salesFigures } from '../report/sales-figures';
import { summarySpec } from '../report/summary';
import { useReportCashier } from '../report/use-report-cashier';
import { useReportPrint } from '../panels/use-report-print';
import { useReportsDirectories, useReportsFilterScope } from '../scope';
import { PrintSheet } from '../../receipt/print-sheet';
import { ReportsSyncProgress } from '../sync-progress';
import { ScopeRow } from '../scope-row';
import { MenuChip } from '../menu-chip';

function CashierChip({ stretch }: { stretch?: boolean }) {
	const t = useT();
	// Undefined until the directory emits: a chip built from an empty list would offer Everyone
	// as the only choice while the credentials are still being read.
	const { cashiers } = useReportsDirectories();
	const value = useReportsFilterScope().cashierId;
	const actions = useQueryStateActions<'orders'>();
	if (!cashiers) return <Skeleton shape="chip" testID="hero-cashier-loading" />;
	return (
		<MenuChip
			stretch={stretch}
			name="cashier"
			icon="cashier"
			scroll
			value={value ?? 'all'}
			defaultValue="all"
			onChange={(next) => actions.setFilter('cashier', next === 'all' ? undefined : next)}
			choices={[
				{ value: 'all', label: t('reports.everyone') },
				...cashiers.map((row) => ({ value: String(row.id), label: row.display_name ?? '' })),
			]}
		/>
	);
}
const tone = (value: number) =>
	value > 0 ? 'text-ok' : value < 0 ? 'text-bad' : 'text-muted-foreground';
const signed = (value: number, format: (value: number) => string) =>
	value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
type Field = 'gross' | 'orders' | 'average' | 'items';
/** The comparison figures, computed once per group from the comparison orders. */
type Comparison =
	{ count: number; figures: ReturnType<typeof salesFigures> } | 'loading' | 'failed';
function Difference({
	id,
	current,
	field,
	format,
	percent,
	label,
	numDecimals,
	comparison,
}: {
	id: string;
	current: number;
	field: Field;
	format: (value: number) => string;
	/** The store's one-decimal number format, for the percentage line. */
	percent?: (value: number) => string;
	label?: string;
	numDecimals?: number;
	comparison: Comparison;
}) {
	const t = useT();
	if (comparison === 'loading')
		return <View testID={`${id}-loading`} className="bg-muted h-4 w-24 rounded" />;
	// Money is compared at the displayed precision, with the currency formatter's own rounding
	// (lodash), so two figures that read the same never differ.
	const round = (value: number) =>
		field === 'orders' || field === 'items' ? value : roundTo(value, numDecimals ?? 2);
	const previous =
		comparison === 'failed'
			? 0
			: round(field === 'orders' ? comparison.count : comparison.figures[field]);
	const shown = round(current);
	// No orders to compare with (or the comparison could not be read): every line reads "—",
	// never a difference against nothing.
	const none =
		comparison === 'failed' || comparison.count === 0 || (field === 'gross' && previous === 0);
	// The percentage is rounded to its displayed tenth before the sign and tone are chosen.
	const delta = none
		? 0
		: field === 'gross'
			? Math.round(((shown - previous) / previous) * 1000) / 10
			: shown - previous;
	return (
		<Text
			testID={id}
			accessibilityLabel={none ? t('reports.no_comparison') : undefined}
			className={`text-sm font-semibold ${tone(delta)}`}
		>
			{none
				? '—'
				: field === 'gross'
					? `${signed(delta, percent ?? ((n) => n.toFixed(1)))}% ${label}`
					: signed(delta, format)}
		</Text>
	);
}
/** Reads the comparison once for the whole group (mounted inside ReportsComparison). */
function ComparedFigures(props: Omit<React.ComponentProps<typeof Figures>, 'comparison'>) {
	const { comparisonOrders } = useReportsData();
	const figures = salesFigures({ orders: comparisonOrders, decimals: props.numDecimals });
	return <Figures {...props} comparison={{ count: comparisonOrders.length, figures }} />;
}
/** The figure and its companions; the comparison is one value for all four lines. */
function Figures({
	phone,
	total,
	companions,
	money,
	number,
	percent,
	label,
	numDecimals,
	comparison,
}: {
	phone: boolean;
	total: number;
	companions: {
		id: string;
		label: string;
		value: number;
		field: Field;
		format: (value: number) => string;
	}[];
	money: (value: number) => string;
	number: (value: number) => string;
	percent: (value: number) => string;
	label: string;
	numDecimals?: number;
	comparison: Comparison;
}) {
	return (
		<View className={phone ? 'gap-5' : 'flex-row items-center justify-between gap-6'}>
			<View testID="hero-figure" className="gap-1">
				<Text testID="hero-total" className="text-4xl font-bold tabular-nums">
					{money(total)}
				</Text>
				<Difference
					id="hero-delta"
					current={total}
					field="gross"
					format={number}
					percent={percent}
					label={label}
					numDecimals={numDecimals}
					comparison={comparison}
				/>
			</View>
			<View testID="hero-companions" className={`flex-row gap-4 ${phone ? '' : 'flex-1'}`}>
				{companions.map((item) => (
					<View key={item.id} className="min-w-0 flex-1 gap-1">
						<Text variant="key">{item.label}</Text>
						<Text testID={`hero-${item.id}`} className="text-2xl font-semibold tabular-nums">
							{item.format(item.value)}
						</Text>
						<Difference
							id={`hero-${item.id}-delta`}
							current={item.value}
							field={item.field}
							format={item.format}
							numDecimals={numDecimals}
							comparison={comparison}
						/>
					</View>
				))}
			</View>
		</View>
	);
}
/** The card while the orders load; the scope stays available above it. */
export function HeroShell() {
	return (
		<Card testID="reports-hero-loading" padding="body" className="gap-5">
			<Skeleton shape="line" className="h-12 w-64" />
			<Skeleton shape="line" className="h-10 w-48" />
			<Skeleton shape="line" className="h-56" />
		</Card>
	);
}
/** Printing has its own boundary so a loading directory never blanks the sales figure. */
function HeroPrint({ storeId }: { storeId?: number }) {
	const host = usePageSheetHost();
	const t = useT();
	const phone = useIsPhone();
	const { figures } = useReportsData();
	const { statusMode } = useReportsScope();
	const formats = useReportFormats(storeId);
	const { allStores, names, namesReady } = useReportsFilterScope();
	const online = useOnlineStatus().status === 'online-website-available';
	const cashier = useReportCashier();
	const [sheetOpen, setSheetOpen] = React.useState(false);
	const spec = summarySpec(
		{
			figures,
			registerNames: names.register,
			cashierNames: names.cashier,
			storeNames: allStores ? names.store : undefined,
		},
		t,
		formats
	);
	const { doc, waiting, print, error, scopeLine } = useReportPrint({
		key: 'summary',
		title: t('reports.summary_title'),
		spec,
		scope: [
			cashier.name,
			statusMode === 'all' ? t('reports.every_status') : t('reports.completed_processing'),
		],
		dataReady:
			!!formats.store &&
			cashier.ready &&
			(figures.byCashier.length < 2 || namesReady.cashier) &&
			(allStores ||
				namesReady.register ||
				!online ||
				figures.registersStamped.length < 2 ||
				figures.registersStamped.every(({ registerId }) => !!names.register[registerId])),
		needsRefunds: true,
	});
	return (
		<View className="items-end gap-2">
			{phone ? (
				<IconButton
					name="print"
					testID="hero-print"
					accessibilityLabel={t('reports.print_summary')}
					onPress={() => setSheetOpen(true)}
				/>
			) : (
				<Button
					testID="hero-print"
					variant="outline"
					leftIcon="print"
					onPress={() => setSheetOpen(true)}
				>
					{t('reports.print_summary')}
				</Button>
			)}
			<PrintSheet
				portalHost={host}
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				doc={doc}
				title={t('reports.summary_title')}
				description={scopeLine}
				printLabel={t('reports.print_summary')}
				waiting={waiting}
				error={error}
				onPrint={print}
				testID="hero-print-sheet"
			/>
		</View>
	);
}
function useLeftOutCount(): number {
	const { allOrders } = useReportsData();
	const included = useIncludedStatus();
	const { unselectedRowIds } = useReportsSelection();
	return allOrders.filter((order) => included(order) && unselectedRowIds[order.uuid]).length;
}
function LeftOutChip({ count, stretch }: { count: number; stretch?: boolean }) {
	const t = useT();
	const { storeId } = useReportsPeriod();
	const { quantity } = useReportFormats(storeId);
	const { setDetail } = useReportsScope();
	const { setUnselectedRowIds } = useReportsSelection();
	return (
		<Chip
			stretch={stretch}
			testID="hero-chip-left-out"
			icon="cart"
			on
			label={t('reports.orders_left_out', { count, n: quantity(count) })}
			onClear={() => setUnselectedRowIds({})}
			clearTestID="hero-chip-left-out-clear"
			clearLabel={t('reports.put_them_back')}
			onPress={() => setDetail('orders')}
		/>
	);
}
function ChipsLayout({ phone, children }: { phone: boolean; children: React.ReactNode }) {
	return phone ? (
		<TileGrid columns={2} testID="hero-chips">
			{children}
		</TileGrid>
	) : (
		<View testID="hero-chips" className="flex-row flex-wrap gap-2">
			{children}
		</View>
	);
}
function SettledChips({
	phone,
	stretch,
	children,
}: {
	phone: boolean;
	stretch?: boolean;
	children: React.ReactNode;
}) {
	const count = useLeftOutCount();
	return (
		<ChipsLayout phone={phone}>
			{children}
			{count > 0 && <LeftOutChip count={count} stretch={stretch} />}
		</ChipsLayout>
	);
}
export function SalesScopeChips({ settled }: { settled: boolean }) {
	const t = useT();
	const phone = useIsPhone();
	const { statusMode, setStatusMode } = useReportsScope();
	const shared = (
		<>
			<React.Suspense
				fallback={<View testID="hero-cashier-loading" className="bg-muted h-12 w-28 rounded" />}
			>
				<CashierChip stretch={phone} />
			</React.Suspense>
			<MenuChip
				stretch={phone}
				name="status"
				icon="cartDone"
				value={statusMode}
				defaultValue="done"
				onChange={(next) => setStatusMode(next as typeof statusMode)}
				choices={[
					{ value: 'done', label: t('reports.completed_processing') },
					{ value: 'all', label: t('reports.every_status'), hint: t('reports.every_status_hint') },
				]}
			/>
		</>
	);
	return settled ? (
		<SettledChips phone={phone} stretch={phone}>
			{shared}
		</SettledChips>
	) : (
		<ChipsLayout phone={phone}>{shared}</ChipsLayout>
	);
}
export function SalesScope({ date, settled }: { date: React.ReactNode; settled: boolean }) {
	const t = useT();
	const phone = useIsPhone();
	const { storeId } = useReportsPeriod();
	const disabledPrint = phone ? (
		<IconButton name="print" accessibilityLabel={t('reports.print_summary')} disabled />
	) : (
		<Button variant="outline" leftIcon="print" disabled>
			{t('reports.print_summary')}
		</Button>
	);
	return (
		<ScopeRow
			testID="reports-scope-strip"
			date={date}
			chips={<SalesScopeChips settled={settled} />}
			actions={
				settled ? (
					<React.Suspense fallback={disabledPrint}>
						<HeroPrint storeId={storeId} />
					</React.Suspense>
				) : (
					disabledPrint
				)
			}
		/>
	);
}
export function Hero() {
	const t = useT();
	const phone = useIsPhone();
	const { cmp, setCmp, statusMode, chartView, setChartView } = useReportsScope();
	const { comparisonHandle } = useReportsHandles();
	const { period, timezone, storeId, dateRange } = useReportsPeriod();
	const { store, money, number, quantity, percent } = useReportFormats(storeId);
	const { formatDate } = useLocalDate();
	const { selectedOrders, figures: sales } = useReportsData();
	const weekday = formatDate(inZone(timezone, dateRange.start), 'EEEE');
	const comparisons = [
		{ value: 'yesterday', label: t('reports.vs_yesterday') },
		{ value: 'lastweek', label: t('reports.vs_last_weekday', { weekday }) },
	];
	const label =
		period === 'day'
			? comparisons.find((row) => row.value === cmp)!.label
			: period === 'week'
				? t('reports.vs_week_before')
				: t('reports.vs_month_before');
	const compareChip =
		period === 'day' ? (
			<MenuChip
				name="compare"
				icon="swap"
				value={cmp}
				defaultValue="yesterday"
				onChange={(next) => setCmp(next as typeof cmp)}
				choices={comparisons}
				hint={t('reports.compare_live_hint')}
			/>
		) : (
			<Chip testID="hero-chip-compare" icon="swap" label={label} disabled dimmed />
		);
	const toggle = (
		<SegmentedControl
			testID="hero-chart-toggle"
			className={phone ? 'w-full' : 'w-72'}
			value={chartView}
			onValueChange={(value) => setChartView(value as typeof chartView)}
			segments={[
				{
					value: 'hour',
					label: period === 'day' ? t('reports.by_hour') : t('reports.by_day'),
					testID: 'hero-chart-toggle-hour',
				},
				{ value: 'run', label: t('reports.running_total'), testID: 'hero-chart-toggle-run' },
			]}
		/>
	);
	const figures = {
		phone,
		total: sales.gross,
		money,
		number,
		percent,
		label,
		numDecimals: store?.price_num_decimals,
		companions: [
			{
				id: 'orders',
				label: t('common.orders'),
				value: selectedOrders.length,
				field: 'orders' as const,
				format: number,
			},
			{
				id: 'average',
				label: t('reports.average_order'),
				value: sales.average,
				field: 'average' as const,
				format: money,
			},
			{
				id: 'items',
				label: t('reports.items'),
				value: sales.items,
				field: 'items' as const,
				format: quantity,
			},
		],
	};
	// Another store's figures wait for its document: money in the till's currency and precision
	// would be wrong money.
	if (!store) return <HeroShell />;
	return (
		<Card testID="reports-hero" padding="body" className="gap-5">
			{/* One comparison read for the four difference lines. Its loading and its failure are
			    the differences' alone: the figure and companions stay (ledger 22). */}
			<ErrorBoundary
				FallbackComponent={() => <Figures {...figures} comparison="failed" />}
				// A failed comparison is retried when its query changes (range, cashier, choice, status).
				// A status change keeps the handle, so the reset asks the engine again for it.
				resetKeys={[comparisonHandle, cmp, statusMode]}
				onReset={() => comparisonHandle.retry()}
			>
				<React.Suspense fallback={<Figures {...figures} comparison="loading" />}>
					<ReportsComparison>
						<ComparedFigures {...figures} />
					</ReportsComparison>
				</React.Suspense>
			</ErrorBoundary>
			<ReportsSyncProgress lane="comparison" />
			{phone ? (
				<>
					<View className="self-start">{compareChip}</View>
					{toggle}
				</>
			) : (
				<View className="flex-row items-center justify-between gap-2">
					{compareChip}
					{toggle}
				</View>
			)}
			<View testID="hero-chart" className="h-56 w-full">
				<ErrorBoundary
					FallbackComponent={() => <Chart />}
					resetKeys={[comparisonHandle, cmp, statusMode]}
					onReset={() => comparisonHandle.retry()}
				>
					<React.Suspense fallback={<Chart />}>
						<ReportsComparison>
							<Chart comparison />
						</ReportsComparison>
					</React.Suspense>
				</ErrorBoundary>
			</View>
		</Card>
	);
}
