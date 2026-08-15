import * as React from 'react';

import { Circle, useFont } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import { Area, CartesianChart, Line } from 'victory-native';

import { useLocalDate } from '@wcpos/core/hooks/use-local-date';

import { TrendFrame, type TrendPoint } from './trend-frame';
import { niceCeil, xTickValues, yTickValues } from './trend-scale';

export type { TrendPoint };

/**
 * A readable time-series line for the Store health trends: clock-time x ticks
 * on the hour buckets, three clean y ticks over a zero-based domain, hairline
 * gridlines, a 2px line over a faint area wash, and a marked latest point.
 * One hue per chart, no legend — the header row names the series (colour is
 * meaning: accent = the POS's own activity, neutral ink = the server's
 * context).
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

	const domainTop = niceCeil(Math.max(...points.map((point) => point.y)));
	const xTicks = xTickValues(points);

	return (
		<TrendFrame points={points} label={label} testID={testID} formatValue={formatValue}>
			<CartesianChart
				data={points}
				xKey="x"
				yKeys={['y']}
				domain={{ y: [0, domainTop] }}
				padding={{ top: 6, right: 10 }}
				xAxis={{
					font,
					tickValues: xTicks,
					lineWidth: 0,
					labelColor: mutedForeground,
					formatXLabel: (ms) => formatDate(new Date(ms as number), 'p'),
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
					const last = chartPoints.y.at(-1);
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
							{last !== undefined && last.y !== null ? (
								<>
									{/* Surface ring keeps the end-dot legible over the line. */}
									<Circle cx={last.x} cy={last.y} r={6} color={surface} />
									<Circle cx={last.x} cy={last.y} r={4} color={color} />
								</>
							) : null}
						</>
					);
				}}
			</CartesianChart>
		</TrendFrame>
	);
}
