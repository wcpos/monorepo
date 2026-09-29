import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Chip } from '@wcpos/components/chip';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
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
import { ReportsComparison, useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { calculateTotals } from '../report/utils';
import { useReportPrint } from '../report/use-report-print';
import { ZReport } from '../report/template';

type Choice = { value: string; label: string; hint?: string };
function MenuChip({
	name,
	icon,
	value,
	defaultValue,
	choices,
	onChange,
	hint,
}: {
	name: string;
	icon: React.ComponentProps<typeof Chip>['icon'];
	value: string;
	defaultValue: string;
	choices: Choice[];
	onChange: (value: string) => void;
	hint?: string;
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
				{hint && <Text className="text-muted-foreground p-3 text-sm">{hint}</Text>}
			</PopoverContent>
		</Popover>
	);
}
function CashierChip() {
	const t = useT();
	const { site } = useStoreSession();
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const cashiers = useObservableState(source, []) as WPCredentialsDocument[];
	const value = useQueryState<'orders'>().filters.cashier;
	const actions = useQueryStateActions<'orders'>();
	return (
		<MenuChip
			name="cashier"
			icon="user"
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
function Difference({
	id,
	current,
	field,
	format,
	label,
	numDecimals,
}: {
	id: string;
	current: number;
	field: 'total' | 'orders' | 'averageOrderValue' | 'totalItemsSold';
	format: (value: number) => string;
	label?: string;
	numDecimals?: number;
}) {
	const t = useT();
	const { comparisonOrders } = useReportsData();
	// The same rounding as the current figure, or a rounded average reads as a difference.
	const totals = calculateTotals({ orders: comparisonOrders, num_decimals: numDecimals });
	const previous = field === 'orders' ? comparisonOrders.length : totals[field];
	// No orders to compare with: every line reads "—", never a difference against nothing.
	const none = comparisonOrders.length === 0 || (field === 'total' && previous === 0);
	const delta = none
		? 0
		: field === 'total'
			? ((current - previous) / previous) * 100
			: current - previous;
	return (
		<Text
			testID={id}
			accessibilityLabel={none ? t('reports.no_comparison') : undefined}
			className={`text-sm font-semibold ${tone(delta)}`}
		>
			{none
				? '—'
				: field === 'total'
					? `${signed(delta, (n) => n.toFixed(1))}% ${label}`
					: signed(delta, format)}
		</Text>
	);
}
function ComparisonLine(props: React.ComponentProps<typeof Difference>) {
	return (
		<React.Suspense
			fallback={<View testID={`${props.id}-loading`} className="bg-muted h-4 w-24 rounded" />}
		>
			<ReportsComparison>
				<Difference {...props} />
			</ReportsComparison>
		</React.Suspense>
	);
}
export function Hero({ title }: { title: React.ReactNode }) {
	const t = useT();
	const { screenSize } = useTheme();
	const phone = screenSize === 'sm';
	const { cmp, setCmp, statusMode, setStatusMode } = useReportsScope();
	const { period, timezone, storeId, dateRange } = useReportsPeriod();
	const store = useDocField(useViewedStore(storeId), (value) => value);
	const options = {
		decimalScale: store?.price_num_decimals,
		decimalSeparator: store?.price_decimal_sep,
		thousandSeparator: store?.price_thousand_sep,
	};
	const { format: money } = useCurrencyFormat({
		...options,
		currency: store?.currency,
		currencyPosition: store?.currency_pos,
	});
	const { format: number } = useNumberFormat(options);
	const { formatDate } = useLocalDate();
	const { selectedOrders } = useReportsData();
	const totals = calculateTotals({
		orders: selectedOrders,
		num_decimals: store?.price_num_decimals,
	});
	const weekday = formatDate(inZone(timezone, dateRange.start), 'EEEE');
	const comparisons = [
		{ value: 'yesterday', label: t('reports.vs_yesterday') },
		{ value: 'lastweek', label: t('reports.vs_last_weekday', { weekday }) },
	];
	const label =
		period === 'day'
			? comparisons.find((row) => row.value === cmp)!.label
			: t(period === 'week' ? 'reports.vs_week_before' : 'reports.vs_month_before');
	const { print, isPrinting, contentRef } = useReportPrint();
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
	const companions = [
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
	];
	return (
		<View testID="reports-hero" className="bg-card gap-5 rounded-md border p-5">
			<View testID="hero-title" className="flex-row items-center justify-between gap-2">
				{title}
				<View className="flex-row items-center gap-2">
					<IconButton
						testID="hero-print"
						name="printer"
						accessibilityLabel={t('reports.print')}
						onPress={print}
						loading={isPrinting}
					/>
				</View>
			</View>
			{phone ? (
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{chips}
				</ScrollView>
			) : (
				chips
			)}
			<View className={phone ? 'gap-5' : 'flex-row items-center justify-between gap-6'}>
				<View testID="hero-figure" className="gap-1">
					<Text testID="hero-total" className="text-4xl font-bold tabular-nums">
						{money(totals.total)}
					</Text>
					<ComparisonLine
						id="hero-delta"
						current={totals.total}
						field="total"
						format={number}
						label={label}
						numDecimals={store?.price_num_decimals}
					/>
				</View>
				<View testID="hero-companions" className={`flex-row gap-4 ${phone ? '' : 'flex-1'}`}>
					{companions.map((item) => (
						<View key={item.id} className="min-w-0 flex-1 gap-1">
							<Text className="text-muted-foreground text-sm">{item.label}</Text>
							<Text testID={`hero-${item.id}`} className="text-2xl font-semibold tabular-nums">
								{item.format(item.value)}
							</Text>
							<ComparisonLine
								id={`hero-${item.id}-delta`}
								current={item.value}
								field={item.field}
								format={item.format}
								numDecimals={store?.price_num_decimals}
							/>
						</View>
					))}
				</View>
			</View>
			<View testID="hero-chart" className="h-56 w-full">
				<Chart />
			</View>
			<View className="hidden">
				<View ref={contentRef}>
					<ZReport />
				</View>
			</View>
		</View>
	);
}
