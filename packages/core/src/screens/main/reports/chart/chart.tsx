import React from 'react';
import { Platform, View } from 'react-native';

import { Circle, RoundedRect, Text, useFont } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useCSSVariable } from 'uniwind';
import { CartesianChart, StackedBar } from 'victory-native';

import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useLocalDate } from '../../../../hooks/use-local-date';
import { useReports } from '../context';
import { aggregateData } from './utils';

import type { AggregatedDataPoint } from './utils';

// Chart data type for victory-native - must have index signature
type ChartDataPoint = AggregatedDataPoint & { [key: string]: unknown };

// Point with position info from victory-native
type PointWithPosition = {
	x: number;
	xValue: string;
	y: number;
	yValue: number;
};

// Tooltip dimensions
const TOOLTIP_WIDTH = 160;
const TOOLTIP_HEIGHT = 88;
const TOOLTIP_PADDING = 10;
const TOOLTIP_MARGIN = 12;

// Tooltip state type
type TooltipState = {
	visible: boolean;
	pointIndex: number;
	x: number;
	totalY: number;
	taxY: number;
};

// Find the index of the point whose x is closest to the given touch x
function findClosestPointIndex(points: PointWithPosition[], touchX: number): number {
	if (!points || points.length === 0) return -1;

	let closestIdx = 0;
	let closestDist = Math.abs(points[0].x - touchX);

	for (let i = 1; i < points.length; i++) {
		const dist = Math.abs(points[i].x - touchX);
		if (dist < closestDist) {
			closestDist = dist;
			closestIdx = i;
		}
	}
	return closestIdx;
}

export default function Chart() {
	const { selectedOrders, dateRange } = useReports();
	const { format } = useCurrencyFormat();
	const { dateFnsLocale, formatDate } = useLocalDate();
	const font = useFont(require('@wcpos/main/assets/fonts/Inter-Medium.ttf'), 12);

	// Theme colors
	const [popoverColor, popoverForegroundColor, primaryColor, mutedForegroundColor, borderColor] =
		useCSSVariable([
			'--color-popover',
			'--color-popover-foreground',
			'--color-primary',
			'--color-muted-foreground',
			'--color-border',
		]).map(String);

	const data = React.useMemo<ChartDataPoint[]>(
		() => aggregateData(selectedOrders, dateRange, dateFnsLocale) as ChartDataPoint[],
		[selectedOrders, dateRange, dateFnsLocale]
	);
	// Max is subtotal + tax = total (the actual order total)
	const maxTotal = Math.max(...data.map((d) => d.total), 0);

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
			.minDuration(100)
			.onStart((e) => showAt(e.x))
			.onEnd(hide)
			.runOnJS(true);

		const panGesture = Gesture.Pan()
			.minDistance(0)
			.onUpdate((e) => showAt(e.x))
			.runOnJS(true);

		// Combine: long press to activate, pan to track movement
		return Gesture.Simultaneous(longPressGesture, panGesture);
	}, [isWeb]);

	// Calculate tick count based on data length
	// Limit to actual data length to prevent victory-native from interpolating beyond our data
	const tickCount = React.useMemo(() => {
		const len = data.length;
		if (len <= 12) return len;
		if (len <= 24) return Math.min(len, 8);
		if (len <= 31) return Math.min(len, 10);
		return Math.min(len, 12);
	}, [data.length]);

	return (
		<GestureDetector gesture={gesture}>
			<View collapsable={false} style={{ flex: 1 }}>
				<CartesianChart
					data={data}
					xKey="label"
					yKeys={['subtotal', 'total_tax']}
					domainPadding={{ left: 70, right: 70, top: 30 }}
					xAxis={{
						font,
						lineColor: borderColor,
						labelColor: mutedForegroundColor,
						tickCount,
						formatXLabel: (label) => label ?? '',
					}}
					yAxis={[
						{
							yKeys: ['subtotal', 'total_tax'],
							font,
							lineColor: borderColor,
							labelColor: mutedForegroundColor,
							domain: [0, Math.max(maxTotal, 10)],
							formatYLabel: format,
						},
					]}
				>
					{({ points, chartBounds }) => {
						// Resolve the active tooltip from the current touch position and the
						// pixel-positioned points provided by the chart.
						const subtotalPoints = points.subtotal as unknown as PointWithPosition[];
						const taxPoints = points.total_tax as unknown as PointWithPosition[];
						const pointIndex = touch.active ? findClosestPointIndex(subtotalPoints, touch.x) : -1;
						const tooltip: TooltipState | null =
							pointIndex >= 0 && subtotalPoints[pointIndex] && taxPoints[pointIndex]
								? {
										visible: true,
										pointIndex,
										x: subtotalPoints[pointIndex].x,
										totalY: subtotalPoints[pointIndex].y,
										taxY: taxPoints[pointIndex].y,
									}
								: null;

						return (
							<>
								<StackedBar
									chartBounds={chartBounds}
									points={[points.subtotal, points.total_tax]}
									colors={[primaryColor, `${primaryColor}99`]}
									animate={{ type: 'spring' }}
									barWidth={Math.min(50, (chartBounds.right - chartBounds.left) / data.length - 10)}
									barOptions={({ isTop }) => ({
										roundedCorners: isTop ? { topLeft: 5, topRight: 5 } : undefined,
									})}
								/>
								{tooltip && (
									<ToolTip
										tooltip={tooltip}
										point={data[tooltip.pointIndex]}
										chartBounds={chartBounds}
										formatCurrency={format}
										formatDate={formatDate}
										font={font}
										bgColor={popoverColor}
										textColor={popoverForegroundColor}
										accentColor={primaryColor}
									/>
								)}
							</>
						);
					}}
				</CartesianChart>
			</View>
		</GestureDetector>
	);
}

function ToolTip({
	tooltip,
	point,
	chartBounds,
	formatCurrency,
	formatDate,
	font,
	bgColor,
	textColor,
	accentColor,
}: {
	tooltip: TooltipState;
	point: ChartDataPoint;
	chartBounds: { top: number; bottom: number; left: number; right: number };
	formatCurrency: (v: number) => string;
	formatDate: (date: Date, formatString: string) => string;
	font: any;
	bgColor: string;
	textColor: string;
	accentColor: string;
}) {
	const { x, totalY, taxY } = tooltip;

	// Calculate the y position for the TOP of the stacked bar
	// totalY = position where the "total" segment ends
	// taxY = position where "total_tax" value would be if plotted independently
	// For stacked bar: tax segment height in pixels = chartBounds.bottom - taxY
	// Top of stack = totalY - taxHeight
	const taxHeight = chartBounds.bottom - taxY;
	const y = totalY - taxHeight;

	const tooltipHeight = point.refund_total > 0 ? 106 : TOOLTIP_HEIGHT;

	// Calculate tooltip position to keep it on screen
	const spaceAbove = y - chartBounds.top;
	const tooltipAbove = spaceAbove >= tooltipHeight + TOOLTIP_MARGIN;
	const tooltipY = tooltipAbove ? y - tooltipHeight - TOOLTIP_MARGIN : y + TOOLTIP_MARGIN;

	// Horizontal position - centered on x, but constrained to chart bounds
	let tooltipX = x - TOOLTIP_WIDTH / 2;
	const minX = chartBounds.left + TOOLTIP_PADDING;
	const maxX = chartBounds.right - TOOLTIP_WIDTH - TOOLTIP_PADDING;
	tooltipX = Math.max(minX, Math.min(maxX, tooltipX));

	// Determine if we're showing time (for hourly data)
	const showTime = point.key.includes(' ');

	// Format date using date-fns with locale
	const tooltipDate = showTime
		? formatDate(point.dateObj, 'EEE d MMM, HH:mm')
		: formatDate(point.dateObj, 'EEE d MMM yyyy');

	return (
		<>
			{/* Background */}
			<RoundedRect
				x={tooltipX}
				y={tooltipY}
				width={TOOLTIP_WIDTH}
				height={tooltipHeight}
				r={8}
				color={bgColor}
			/>
			{/* Date */}
			<Text
				x={tooltipX + TOOLTIP_PADDING}
				y={tooltipY + TOOLTIP_PADDING + 12}
				text={tooltipDate}
				font={font}
				color={textColor}
			/>
			{/* Total */}
			<Text
				x={tooltipX + TOOLTIP_PADDING}
				y={tooltipY + TOOLTIP_PADDING + 30}
				text={`Total: ${formatCurrency(point.total)}`}
				font={font}
				color={textColor}
			/>
			{/* Tax */}
			<Text
				x={tooltipX + TOOLTIP_PADDING}
				y={tooltipY + TOOLTIP_PADDING + 48}
				text={`Tax: ${formatCurrency(point.total_tax)}`}
				font={font}
				color={textColor}
			/>
			{/* Refunds (only shown when > 0) */}
			{point.refund_total > 0 && (
				<Text
					x={tooltipX + TOOLTIP_PADDING}
					y={tooltipY + TOOLTIP_PADDING + 66}
					text={`Refunds: -${formatCurrency(point.refund_total)}`}
					font={font}
					color={textColor}
				/>
			)}
			{/* Order count */}
			<Text
				x={tooltipX + TOOLTIP_PADDING}
				y={tooltipY + TOOLTIP_PADDING + (point.refund_total > 0 ? 84 : 66)}
				text={`Orders: ${point.order_count}`}
				font={font}
				color={textColor}
			/>
			{/* Indicator dot at the top of the stacked bar */}
			<Circle cx={x} cy={y} r={5} color={accentColor} />
		</>
	);
}
