import * as React from 'react';
import { Platform, View } from 'react-native';

import {
	Circle,
	DashPathEffect,
	RoundedRect,
	Line as SkiaLine,
	Text as SkiaText,
	useFont,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useCSSVariable } from 'uniwind';
import { Area, CartesianChart, type ChartBounds, Line, type PointsArray } from 'victory-native';

import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { inZone, useViewedStore } from '../../../../hooks/use-store-day';
import { useLocalDate } from '../../../../hooks/use-local-date';
import { useNowMs } from '../../health/use-relative-time';
import { useT } from '../../../../contexts/translations';
import { useReportsData, useReportsPeriod, useReportsScope } from '../context';
import { aggregateComparison, aggregateData } from './utils';

// Keep only raw touch state: pixel points belong to the current chart render.
function findClosestPointIndex(points: PointsArray, touchX: number): number {
	return points.reduce(
		(best, point, i) => (Math.abs(point.x - touchX) < Math.abs(points[best].x - touchX) ? i : best),
		0
	);
}

export default function Chart({ comparison = false }: { comparison?: boolean }) {
	const {
		selectedOrders,
		dateRange,
		comparisonRange,
		live,
		wholeComparisonOrders,
		comparisonOrders,
		totals,
	} = useReportsData();
	const { timezone, period: rangePeriod, storeId } = useReportsPeriod();
	const period = rangePeriod as 'day' | 'week' | 'month';
	const { chartView, cmp } = useReportsScope();
	const run = chartView === 'run';
	const store = useDocField(useViewedStore(storeId), (value) => value);
	const { format } = useCurrencyFormat({
		currency: store?.currency,
		currencyPosition: store?.currency_pos,
		decimalScale: store?.price_num_decimals,
		decimalSeparator: store?.price_decimal_sep,
		thousandSeparator: store?.price_thousand_sep,
		thousandsGroupStyle: store?.thousands_group_style,
	});
	const { dateFnsLocale, formatDate } = useLocalDate();
	const t = useT();
	const font = useFont(require('../../../../assets/fonts/Inter-Medium.ttf'), 12);
	const [popoverColor, textColor, primaryColor, mutedForegroundColor, borderColor, mutedColor] =
		useCSSVariable([
			'--color-popover',
			'--color-popover-foreground',
			'--color-primary',
			'--color-muted-foreground',
			'--color-border',
			'--color-muted',
		]).map(String);
	const buckets = React.useMemo(
		() =>
			aggregateData(
				selectedOrders,
				dateRange,
				dateFnsLocale,
				timezone,
				comparison ? { orders: wholeComparisonOrders, range: comparisonRange } : undefined,
				period
			),
		[
			selectedOrders,
			dateRange,
			dateFnsLocale,
			timezone,
			comparison,
			wholeComparisonOrders,
			comparisonRange,
			period,
		]
	);
	const compared = React.useMemo(
		() =>
			aggregateComparison(
				wholeComparisonOrders,
				comparisonRange,
				buckets,
				dateRange,
				period,
				timezone
			),
		[wholeComparisonOrders, comparisonRange, buckets, dateRange, period, timezone]
	);
	const cut = React.useMemo(
		() =>
			aggregateComparison(comparisonOrders, comparisonRange, buckets, dateRange, period, timezone),
		[comparisonOrders, comparisonRange, buckets, dateRange, period, timezone]
	);
	const now = useNowMs(60_000);
	const data = React.useMemo(() => {
		return buckets.map((bucket, index) => {
			const running = buckets.slice(0, index + 1).reduce((sum, row) => sum + row.total, 0);
			const previous = compared.slice(0, index + 1).reduce((sum, row) => sum + (row.total ?? 0), 0);
			const future = live && bucket.key > now;
			return {
				...bucket,
				index,
				future,
				current: future ? null : run ? running : bucket.total,
				comparison:
					!comparison || compared[index].total === null
						? null
						: run
							? previous
							: compared[index].total,
				futureTotal: comparison && future && !run ? compared[index].total : null,
			};
		});
	}, [buckets, compared, live, now, run, comparison]);
	const peak = data.reduce(
		(best, row, i) => (!row.future && row.total > data[best].total ? i : best),
		0
	);
	const currentEnd = data.findLastIndex((row) => row.current !== null);
	const comparisonEnd = data.findLastIndex((row) => row.comparison !== null);
	const max = Math.max(10, ...data.flatMap((row) => [row.current ?? 0, row.comparison ?? 0])) * 1.3;
	// The comparison label reads the line's own endpoint: the running sum of the
	// mapped buckets. Days of the previous period with no counterpart in this one
	// (a 31st against a 30-day month) are not plotted, so they are not labelled.
	const comparisonTotal = data[comparisonEnd]?.comparison ?? 0;
	const count = (n: number) => t('reports.chart_orders', { count: n });
	const comparisonLabel =
		period === 'day'
			? cmp === 'yesterday'
				? t('common.yesterday')
				: t('reports.chart_last_weekday', {
						weekday: formatDate(inZone(timezone, comparisonRange.start), 'EEEE'),
					})
			: t(period === 'week' ? 'common.last_week' : 'common.last_month');
	const [bounds, setBounds] = React.useState<ChartBounds | null>(null);
	const [scales, setScales] = React.useState<{
		x: (n: number) => number;
		y: (n: number) => number;
	} | null>(null);
	const onScaleChange = React.useCallback(
		(x: (n: number) => number, y: (n: number) => number) => setScales({ x, y }),
		[]
	);
	/**
	 * Track only the raw touch position in state. The closest-point lookup and
	 * tooltip positioning happen inside the chart render prop below, where the
	 * pixel-positioned `points` are available - this avoids stashing chart points
	 * in a ref and reading that ref from gesture handlers during render.
	 */
	const [touch, setTouch] = React.useState<{ active: boolean; x: number }>({
		active: false,
		x: 0,
	});

	// Platform-specific gestures
	const isWeb = Platform.OS === 'web';

	const gesture = React.useMemo(() => {
		const showAt = (x: number) => setTouch({ active: true, x });
		const hide = () => setTouch((prev) => ({ ...prev, active: false }));
		const longPressDuration = 100;

		if (isWeb) {
			// Web: hover gesture
			return Gesture.Hover()
				.onBegin((e) => showAt(e.x))
				.onUpdate((e) => showAt(e.x))
				.onEnd(hide)
				.runOnJS(true);
		}

		// Native: long press activates tooltip on touch, pan tracks movement
		const longPressGesture = Gesture.LongPress()
			.minDuration(longPressDuration)
			.onStart((e) => showAt(e.x))
			.onEnd(hide)
			.runOnJS(true);

		const panGesture = Gesture.Pan()
			.minDistance(0)
			.activateAfterLongPress(longPressDuration)
			.onUpdate((e) => showAt(e.x))
			.runOnJS(true);

		// Combine: long press to activate, pan to track movement
		return Gesture.Simultaneous(longPressGesture, panGesture);
	}, [isWeb]);

	const tickCount = Math.min(
		data.length,
		data.length <= 12 ? 12 : data.length <= 24 ? 8 : data.length <= 31 ? 10 : 12
	);
	const ticks = Array.from({ length: tickCount }, (_, i) =>
		Math.round((i * (data.length - 1)) / Math.max(1, tickCount - 1))
	);
	// Native text overlays carry real testIDs/accessibility; their coordinates use the actual (niced) canvas scales.
	const label = (
		id: string,
		index: number,
		value: number,
		text: string,
		color: string,
		below = false
	) => {
		if (!bounds || !scales || index < 0) return null;
		// The Skia font measures narrower than the rendered semibold text: leave a third spare so
		// the label never ellipsises, then clamp to the plot.
		const width = Math.min(
			bounds.right - bounds.left,
			(font?.measureText(text).width ?? 190) * 1.35 + 12
		);
		return (
			<Text
				testID={id}
				numberOfLines={1}
				className="pointer-events-none absolute text-xs font-semibold tabular-nums"
				style={{
					color,
					width,
					left: Math.max(bounds.left, Math.min(bounds.right - width, scales.x(index) - width / 2)),
					top: Math.max(
						bounds.top,
						Math.min(bounds.bottom - (run && !below ? 36 : 16), scales.y(value) + (below ? 6 : -22))
					),
				}}
			>
				{text}
			</Text>
		);
	};
	return (
		<GestureDetector gesture={gesture}>
			<View collapsable={false} className="flex-1">
				<CartesianChart
					data={data}
					xKey="index"
					yKeys={['current', 'comparison', 'futureTotal']}
					frame={{ lineWidth: 0 }}
					domain={{ x: [-0.5, Math.max(0.5, data.length - 0.5)], y: [0, max] }}
					onChartBoundsChange={setBounds}
					onScaleChange={onScaleChange}
					xAxis={{
						font,
						lineWidth: 0,
						labelColor: mutedForegroundColor,
						tickCount,
						tickValues: ticks,
						formatXLabel: (index) => data[index]?.label ?? '',
					}}
					yAxis={[{ tickCount: 0, lineWidth: 0, labelPosition: 'inset', formatYLabel: () => '' }]}
				>
					{({ points, chartBounds }) => {
						const current = points.current.filter((point) => point.y != null);
						const path = current.length
							? [
									{ ...current[0], x: chartBounds.left, y: chartBounds.bottom, yValue: 0 },
									...current,
								]
							: [];
						const barWidth = Math.max(
							1,
							Math.min(40, (chartBounds.right - chartBounds.left) / data.length - 6)
						);
						const index =
							touch.active && data.length ? findClosestPointIndex(points.current, touch.x) : -1;
						const row = data[index];
						const point = points.current[index];
						const tip = row
							? [
									row.label,
									format(row.total),
									count(row.order_count),
									...(comparison && compared[index].total !== null
										? [
												`${comparisonLabel} ${format((live && !row.future ? cut[index].total : compared[index].total) ?? 0)}`,
											]
										: []),
								]
							: [];
						return (
							<>
								<SkiaLine
									p1={{ x: chartBounds.left, y: chartBounds.bottom }}
									p2={{ x: chartBounds.right, y: chartBounds.bottom }}
									color={borderColor}
									strokeWidth={0.5}
								/>
								{run ? (
									<>
										<Area
											points={path}
											y0={chartBounds.bottom}
											color={primaryColor}
											opacity={0.1}
										/>
										<Line points={path} color={primaryColor} strokeWidth={2} />
										<Line
											points={path.slice(peak, peak + 2)}
											color={primaryColor}
											strokeWidth={3.5}
										/>
									</>
								) : (
									data.map((row, i) => {
										const y = (row.future ? points.futureTotal[i] : points.current[i]).y;
										return y == null ? null : (
											<RoundedRect
												key={row.key}
												x={points.current[i].x - barWidth / 2}
												y={y}
												width={barWidth}
												height={Math.max(0, chartBounds.bottom - y)}
												r={3}
												color={row.future ? mutedColor : primaryColor}
												opacity={row.future || i === peak ? 1 : 0.55}
											/>
										);
									})
								)}
								{comparison && (
									<Line
										points={points.comparison}
										color={mutedForegroundColor}
										strokeWidth={1.5}
										connectMissingData={false}
									>
										<DashPathEffect intervals={[4, 4]} />
									</Line>
								)}
								{row && point && (
									<ToolTip
										lines={tip}
										x={point.x}
										y={point.y ?? points.comparison[index].y ?? chartBounds.bottom}
										chartBounds={chartBounds}
										font={font}
										bgColor={popoverColor}
										textColor={textColor}
										accentColor={primaryColor}
									/>
								)}
							</>
						);
					}}
				</CartesianChart>
				{!run &&
					data[peak]?.order_count > 0 &&
					label(
						'hero-chart-peak',
						peak,
						data[peak].total,
						`${format(data[peak].total)} · ${count(data[peak].order_count)}`,
						primaryColor
					)}
				{run &&
					label(
						'hero-chart-total',
						Math.max(0, currentEnd),
						data[currentEnd]?.current ?? 0,
						live ? t('reports.amount_now', { amount: format(totals.total) }) : format(totals.total),
						primaryColor
					)}
				{run &&
					comparison &&
					label(
						'hero-chart-comparison-total',
						comparisonEnd,
						comparisonTotal,
						format(comparisonTotal),
						mutedForegroundColor,
						true
					)}
			</View>
		</GestureDetector>
	);
}

function ToolTip({
	lines,
	x,
	y,
	chartBounds,
	font,
	bgColor,
	textColor,
	accentColor,
}: {
	lines: string[];
	x: number;
	y: number;
	chartBounds: ChartBounds;
	font: ReturnType<typeof useFont>;
	bgColor: string;
	textColor: string;
	accentColor: string;
}) {
	const width = Math.min(
		chartBounds.right - chartBounds.left,
		Math.max(160, ...lines.map((line) => (font?.measureText(line).width ?? 0) + 20))
	);
	const height = lines.length * 18 + 20;
	const left = Math.max(chartBounds.left, Math.min(chartBounds.right - width, x - width / 2));
	const top = Math.max(
		chartBounds.top,
		Math.min(
			chartBounds.bottom - height,
			y - chartBounds.top >= height + 12 ? y - height - 12 : y + 12
		)
	);
	return (
		<>
			<RoundedRect x={left} y={top} width={width} height={height} r={8} color={bgColor} />
			{lines.map((line, i) => (
				<SkiaText
					key={i}
					x={left + 10}
					y={top + 22 + i * 18}
					text={line}
					font={font}
					color={textColor}
				/>
			))}
			<Circle cx={x} cy={y} r={5} color={accentColor} />
		</>
	);
}
