import * as React from 'react';
import { ScrollView, View } from 'react-native';

import roundTo from 'lodash/round';
import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Chip } from '@wcpos/components/chip';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import { SegmentedControl } from '@wcpos/components/segmented-control';
import { useDocField } from '@wcpos/query';
import type { WPCredentialsDocument } from '@wcpos/database';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { inZone, useViewedStore } from '../../../../hooks/use-store-day';
import { useLocalDate } from '../../../../hooks/use-local-date';
import { useQueryState, useQueryStateActions } from '../../../../query';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useNumberFormat } from '../../hooks/use-number-format';
import { Chart } from '../chart';
import {
	ReportsComparison,
	useReportsBinding,
	useReportsData,
	useReportsPeriod,
	useReportsScope,
} from '../context';
import { calculateTotals } from '../report/utils';
import { useReportPrint } from '../report/use-report-print';
import { ZReport } from '../report/template';
import { ReportsSyncProgress } from '../sync-progress';

type Choice = { value: string; label: string; hint?: string };
function MenuChip({
	name,
	icon,
	value,
	defaultValue,
	choices,
	onChange,
	hint,
	scroll = false,
}: {
	name: string;
	icon: React.ComponentProps<typeof Chip>['icon'];
	value: string;
	defaultValue: string;
	choices: Choice[];
	onChange: (value: string) => void;
	hint?: string;
	/** A variable-length list (the cashiers) scrolls inside a bounded height; short menus do not. */
	scroll?: boolean;
}) {
	const trigger = React.useRef<React.ComponentRef<typeof PopoverTrigger>>(null);
	const t = useT();
	const choose = (next: string) => {
		if (next !== value) onChange(next);
		trigger.current?.close();
	};
	return (
		<Popover>
			<PopoverTrigger ref={trigger} asChild>
				<Chip
					testID={`hero-chip-${name}`}
					icon={icon}
					label={choices.find((row) => row.value === value)?.label ?? value}
					on={value !== defaultValue}
					onClear={value !== defaultValue ? () => choose(defaultValue) : undefined}
					clearTestID={`hero-chip-${name}-clear`}
					clearLabel={t('common.clear')}
				/>
			</PopoverTrigger>
			<PopoverContent testID={`hero-${name}-menu`}>
				<ScrollView className={scroll ? 'max-h-96' : undefined} scrollEnabled={scroll}>
					{choices.map((row) => (
						<Button
							key={row.value}
							testID={`hero-${name}-${row.value}`}
							variant="ghost"
							className="min-h-12 flex-row justify-start gap-2 px-3"
							onPress={() => choose(row.value)}
						>
							<View className="w-5 items-center">
								{row.value === value && <Icon name="check" size="sm" />}
							</View>
							<View className="min-w-0 flex-1">
								<ButtonText>{row.label}</ButtonText>
								{row.hint && <Text className="text-muted-foreground text-sm">{row.hint}</Text>}
							</View>
						</Button>
					))}
				</ScrollView>
				{hint && <Text className="text-muted-foreground p-3 text-sm">{hint}</Text>}
			</PopoverContent>
		</Popover>
	);
}
function CashierChip() {
	const t = useT();
	const { site } = useStoreSession();
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	// Undefined until the directory emits: a chip built from an empty list would offer Everyone
	// as the only choice while the credentials are still being read.
	const cashiers = useObservableState(source) as WPCredentialsDocument[] | undefined;
	const value = useQueryState<'orders'>().filters.cashier;
	const actions = useQueryStateActions<'orders'>();
	if (!cashiers)
		return <View testID="hero-cashier-loading" className="bg-muted h-12 w-28 rounded" />;
	return (
		<MenuChip
			name="cashier"
			icon="user"
			scroll
			value={value === undefined ? 'all' : String(value)}
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
	value > 0 ? 'text-success' : value < 0 ? 'text-destructive' : 'text-muted-foreground';
const signed = (value: number, format: (value: number) => string) =>
	value === 0 ? '±0' : `${value > 0 ? '+' : '−'}${format(Math.abs(value))}`;
type Field = 'total' | 'orders' | 'averageOrderValue' | 'totalItemsSold';
/** The comparison figures, computed once per group from the comparison orders. */
type Comparison =
	{ count: number; totals: ReturnType<typeof calculateTotals> } | 'loading' | 'failed';
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
		field === 'orders' || field === 'totalItemsSold' ? value : roundTo(value, numDecimals ?? 2);
	const previous =
		comparison === 'failed'
			? 0
			: round(field === 'orders' ? comparison.count : comparison.totals[field]);
	const shown = round(current);
	// No orders to compare with (or the comparison could not be read): every line reads "—",
	// never a difference against nothing.
	const none =
		comparison === 'failed' || comparison.count === 0 || (field === 'total' && previous === 0);
	// The percentage is rounded to its displayed tenth before the sign and tone are chosen.
	const delta = none
		? 0
		: field === 'total'
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
				: field === 'total'
					? `${signed(delta, percent ?? ((n) => n.toFixed(1)))}% ${label}`
					: signed(delta, format)}
		</Text>
	);
}
/** Reads the comparison once for the whole group (mounted inside ReportsComparison). */
function ComparedFigures(props: Omit<React.ComponentProps<typeof Figures>, 'comparison'>) {
	const { comparisonOrders } = useReportsData();
	const totals = calculateTotals({ orders: comparisonOrders, num_decimals: props.numDecimals });
	return <Figures {...props} comparison={{ count: comparisonOrders.length, totals }} />;
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
					field="total"
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
						<Text className="text-muted-foreground text-sm">{item.label}</Text>
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
/** The card while the orders load: the same title row, so the date button is never lost to a
 * slow or stuck all-results request (it is the only way to a smaller range). */
export function HeroShell({ title }: { title: React.ReactNode }) {
	return (
		<View testID="reports-hero-loading" className="bg-card gap-5 rounded-md border p-5">
			<View testID="hero-title" className="flex-row items-center justify-between gap-2">
				{title}
			</View>
			<View className="bg-muted h-12 w-64 rounded" />
			<View className="bg-muted h-10 w-48 rounded" />
			<View className="bg-muted h-56 w-full rounded" />
		</View>
	);
}
/** The print action and its hidden document, under their own boundary: the report's cashier
 * name comes from the credentials directory, and its loading must not blank the figure. */
function HeroPrint({ storeId }: { storeId?: number }) {
	const t = useT();
	const { print, isPrinting, contentRef, ready, waiting } = useReportPrint(storeId);
	return (
		<>
			{waiting && (
				<Text testID="hero-print-waiting" className="text-muted-foreground text-sm">
					{t(
						waiting === 'store'
							? 'reports.loading_store'
							: waiting === 'cashier'
								? 'reports.loading_cashier'
								: 'reports.loading_register_names'
					)}
				</Text>
			)}
			<IconButton
				testID="hero-print"
				name="printer"
				accessibilityLabel={t('reports.print')}
				onPress={print}
				loading={isPrinting}
				disabled={!ready}
			/>
			<View className="hidden">
				<View ref={contentRef}>
					<ZReport storeId={storeId} />
				</View>
			</View>
		</>
	);
}
export function Hero({ title }: { title: React.ReactNode }) {
	const t = useT();
	const { screenSize } = useTheme();
	const phone = screenSize === 'sm';
	const { cmp, setCmp, statusMode, setStatusMode, chartView, setChartView } = useReportsScope();
	const { comparisonBinding } = useReportsBinding();
	const { period, timezone, storeId, dateRange } = useReportsPeriod();
	const store = useDocField(useViewedStore(storeId), (value) => value);
	const options = {
		decimalScale: store?.price_num_decimals,
		decimalSeparator: store?.price_decimal_sep,
		thousandSeparator: store?.price_thousand_sep,
		thousandsGroupStyle: store?.thousands_group_style,
	};
	const { format: money } = useCurrencyFormat({
		...options,
		currency: store?.currency,
		currencyPosition: store?.currency_pos,
	});
	const { format: number } = useNumberFormat(options);
	// The percentage carries the store's separators too (+1,3 % where the store writes 1,3).
	const { format: percent } = useNumberFormat({
		...options,
		decimalScale: 1,
		fixedDecimalScale: true,
	});
	const { formatDate } = useLocalDate();
	const { selectedOrders, totals } = useReportsData();
	const weekday = formatDate(inZone(timezone, dateRange.start), 'EEEE');
	const comparisons = [
		{ value: 'yesterday', label: t('reports.vs_yesterday') },
		{ value: 'lastweek', label: t('reports.vs_last_weekday', { weekday }) },
	];
	const label =
		period === 'day'
			? comparisons.find((row) => row.value === cmp)!.label
			: t(period === 'week' ? 'reports.vs_week_before' : 'reports.vs_month_before');
	const chips = (
		<View testID="hero-chips" className={`flex-row gap-2 ${phone ? '' : 'flex-wrap'}`}>
			<React.Suspense
				fallback={<View testID="hero-cashier-loading" className="bg-muted h-12 w-28 rounded" />}
			>
				<CashierChip />
			</React.Suspense>
			<MenuChip
				name="status"
				icon="cartCircleCheck"
				value={statusMode}
				defaultValue="done"
				onChange={(next) => setStatusMode(next as typeof statusMode)}
				choices={[
					{ value: 'done', label: t('reports.completed_processing') },
					{ value: 'all', label: t('reports.every_status'), hint: t('reports.every_status_hint') },
				]}
			/>
			{period === 'day' ? (
				<MenuChip
					name="compare"
					icon="rightLeft"
					value={cmp}
					defaultValue="yesterday"
					onChange={(next) => setCmp(next as typeof cmp)}
					choices={comparisons}
					hint={t('reports.compare_live_hint')}
				/>
			) : (
				<Chip testID="hero-chip-compare" icon="rightLeft" label={label} disabled dimmed />
			)}
		</View>
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
					label: t(period === 'day' ? 'reports.by_hour' : 'reports.by_day'),
					testID: 'hero-chart-toggle-hour',
				},
				{ value: 'run', label: t('reports.running_total'), testID: 'hero-chart-toggle-run' },
			]}
		/>
	);
	const figures = {
		phone,
		total: totals.total,
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
				value: totals.averageOrderValue,
				field: 'averageOrderValue' as const,
				format: money,
			},
			{
				id: 'items',
				label: t('reports.items'),
				value: totals.totalItemsSold,
				field: 'totalItemsSold' as const,
				format: number,
			},
		],
	};
	// Another store's figures wait for its document: money in the till's currency and precision
	// would be wrong money.
	if (!store) return <HeroShell title={title} />;
	return (
		<View testID="reports-hero" className="bg-card gap-5 rounded-md border p-5">
			<View testID="hero-title" className="flex-row items-center justify-between gap-2">
				{title}
				<View className="flex-row items-center gap-2">
					{!phone && toggle}
					<React.Suspense
						fallback={
							<IconButton name="printer" accessibilityLabel={t('reports.print')} disabled />
						}
					>
						<HeroPrint storeId={storeId} />
					</React.Suspense>
				</View>
			</View>
			{phone && toggle}
			{phone ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{chips}
				</ScrollView>
			) : (
				chips
			)}
			{/* One comparison read for the four difference lines. Its loading and its failure are
			    the differences' alone: the figure and companions stay (ledger 22). */}
			<ErrorBoundary
				FallbackComponent={() => <Figures {...figures} comparison="failed" />}
				// A failed comparison is retried when its query changes (range, cashier, choice, status).
				resetKeys={[comparisonBinding, cmp, statusMode]}
			>
				<React.Suspense fallback={<Figures {...figures} comparison="loading" />}>
					<ReportsComparison>
						<ComparedFigures {...figures} />
					</ReportsComparison>
				</React.Suspense>
			</ErrorBoundary>
			<ReportsSyncProgress lane="comparison" />
			<View testID="hero-chart" className="h-56 w-full">
				<ErrorBoundary
					FallbackComponent={() => <Chart />}
					resetKeys={[comparisonBinding, cmp, statusMode]}
				>
					<React.Suspense fallback={<Chart />}>
						<ReportsComparison>
							<Chart comparison />
						</ReportsComparison>
					</React.Suspense>
				</ErrorBoundary>
			</View>
		</View>
	);
}
