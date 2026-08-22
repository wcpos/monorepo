import * as React from 'react';

import { Circle, Line as SkiaLine, useFont, vec } from '@shopify/react-native-skia';
import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useCSSVariable } from 'uniwind';
import {
	Area,
	type CartesianActionsHandle,
	CartesianChart,
	Line,
	useChartPressState,
} from 'victory-native';

import { useLocalDate } from '@wcpos/core/hooks/use-local-date';

import { TrendFrame, type TrendPoint } from './trend-frame';
import { niceCeil, xTickValues, yTickValues } from './trend-scale';

export type { TrendPoint };

/**
 * A readable time-series line for the Store health trends: clock-time x ticks
 * on the hour buckets, three clean y ticks over a zero-based domain, hairline
 * gridlines, a 2px line over a faint area wash, and a marked point.
 * One hue per chart, no legend — the header row names the series (colour is
 * meaning: accent = the POS's own activity, neutral ink = the server's
 * context).
 *
 * Pointing at the chart reads it out: a hairline crosshair marks the nearest
 * bucket and the frame's header switches to that bucket's time and value, so
 * every plotted number is legible without a floating box covering the line.
 * `Gesture.Hover()` drives it — a mouse gets the readout on hover, and on a
 * touchscreen till victory's own press gesture (which it races against, and
 * which hover can never win on a device with no pointer) gives the same
 * readout on touch-and-drag. Both feed the SAME `handleTouch` the library uses
 * internally, so the crosshair snaps to the datum the library itself would
 * pick.
 *
 * The frame is always drawn: TrendFrame decides whether there is a trend to
 * put in it, so a fresh till sees the chart's footprint and a quiet "not
 * enough data yet" line instead of a collapsed header row.
 */
export function TrendLineChart({
	points,
	label,
	tone,
	testID,
	formatValue = (value: number) => value.toLocaleString(),
}: {
	points: TrendPoint[];
	label: string;
	tone: 'accent' | 'neutral';
	testID: string;
	formatValue?: (value: number) => string;
}) {
	const font = useFont(require('../../assets/fonts/Inter-Medium.ttf'), 11);
	const { formatDate } = useLocalDate();
	const [accent, neutral, border, mutedForeground, surface] = useCSSVariable([
		'--color-primary',
		'--color-muted-foreground',
		'--color-border',
		'--color-muted-foreground',
		'--color-background',
	]).map(String);
	const color = tone === 'accent' ? accent : neutral;

	const formatTime = React.useCallback((x: number) => formatDate(new Date(x), 'p'), [formatDate]);

	const domainTop = niceCeil(Math.max(...points.map((point) => point.y)));
	const xTicks = xTickValues(points);

	const { state: press, isActive: pressing } = useChartPressState({ x: 0, y: { y: 0 } });
	// The SharedValue flavour of the actions ref, because the gesture callbacks
	// below are worklets — `handleTouch` has to be readable on the UI thread.
	const actions = useSharedValue<CartesianActionsHandle<typeof press> | null>(null);
	// The crosshair and the header readout are React-rendered, so the matched
	// datum has to cross back from the UI thread. It changes once per bucket
	// crossed, not once per pointer sample.
	const [matchedIndex, setMatchedIndex] = React.useState(-1);
	const [hovering, setHovering] = React.useState(false);
	useAnimatedReaction(
		() => press.matchedIndex.value,
		(index, previous) => {
			if (index !== previous) scheduleOnRN(setMatchedIndex, index);
		}
	);

	// Raced so it satisfies `customGestures`' ComposedGesture type; victory races
	// it against its own press gesture either way. Both feed the SAME
	// `handleTouch`, so hover and touch land on the same datum.
	const hover = React.useMemo(
		() =>
			Gesture.Race(
				Gesture.Hover()
					.onBegin((event) => {
						'worklet';
						scheduleOnRN(setHovering, true);
						actions.value?.handleTouch(press, event.x, event.y);
					})
					.onUpdate((event) => {
						'worklet';
						actions.value?.handleTouch(press, event.x, event.y);
					})
					.onFinalize(() => {
						'worklet';
						scheduleOnRN(setHovering, false);
					})
			),
		[actions, press]
	);

	// `matchedIndex` is the LAST datum touched and outlives the gesture, so the
	// crosshair only exists while a pointer actually is on the plot. A shrinking
	// series can leave the index pointing past the end for a render.
	const activeIndex =
		(hovering || pressing) && matchedIndex >= 0 && matchedIndex < points.length ? matchedIndex : -1;

	const active = activeIndex >= 0 ? points[activeIndex] : null;

	return (
		<TrendFrame
			points={points}
			label={label}
			testID={testID}
			active={active}
			formatValue={formatValue}
			formatTime={formatTime}
		>
			<CartesianChart
				data={points}
				xKey="x"
				yKeys={['y']}
				domain={{ y: [0, domainTop] }}
				padding={{ top: 6, right: 10 }}
				chartPressState={press}
				actionsRef={actions}
				customGestures={hover}
				xAxis={{
					font,
					tickValues: xTicks,
					lineWidth: 0,
					labelColor: mutedForeground,
					formatXLabel: (ms) => formatTime(ms as number),
				}}
				yAxis={[
					{
						font,
						tickValues: yTickValues(domainTop),
						lineColor: border,
						labelColor: mutedForeground,
						formatYLabel: (value) => formatValue(value as number),
					},
				]}
			>
				{({ points: chartPoints, chartBounds }) => {
					// The marked point is whichever one the header is reporting: the
					// pointed-at bucket while pointing, the latest sample otherwise.
					const hovered =
						activeIndex >= 0 && activeIndex < chartPoints.y.length
							? chartPoints.y[activeIndex]
							: undefined;
					const marked = hovered ?? chartPoints.y.at(-1);
					return (
						<>
							<Area
								points={chartPoints.y}
								y0={chartBounds.bottom}
								color={color}
								opacity={0.1}
								curveType="linear"
							/>
							<Line points={chartPoints.y} color={color} strokeWidth={2} curveType="linear" />
							{hovered !== undefined ? (
								<SkiaLine
									p1={vec(hovered.x, chartBounds.top)}
									p2={vec(hovered.x, chartBounds.bottom)}
									color={border}
									strokeWidth={1}
								/>
							) : null}
							{marked !== undefined && marked.y !== null ? (
								<>
									{/* Surface ring keeps the marked dot legible over the line. */}
									<Circle cx={marked.x} cy={marked.y} r={6} color={surface} />
									<Circle cx={marked.x} cy={marked.y} r={4} color={color} />
								</>
							) : null}
						</>
					);
				}}
			</CartesianChart>
		</TrendFrame>
	);
}
