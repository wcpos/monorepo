import * as React from 'react';

import { useCSSVariable } from 'uniwind';
import { CartesianChart, Line } from 'victory-native';

import { TrendFrame, type TrendPoint } from './trend-frame';

export type { TrendPoint };

/**
 * A quiet sparkline for the Store health trends — one hue, no axes, no grid;
 * the caption row carries the label and the latest value (colour is meaning:
 * accent = the POS's own activity, neutral ink = the server's context).
 *
 * The frame is always drawn: TrendFrame decides whether there is a trend to
 * put in it, so a fresh till sees the chart's footprint and a quiet "not
 * enough data yet" line instead of a collapsed caption row.
 */
export function TrendLineChart({
	points,
	label,
	tone,
	testID,
}: {
	points: TrendPoint[];
	label: string;
	tone: 'accent' | 'neutral';
	testID: string;
}) {
	const accent = useCSSVariable('--color-primary');
	const neutral = useCSSVariable('--color-muted-foreground');
	const color = tone === 'accent' ? accent : neutral;

	return (
		<TrendFrame points={points} label={label} testID={testID}>
			<CartesianChart data={points} xKey="x" yKeys={['y']} domainPadding={{ top: 4, bottom: 4 }}>
				{({ points: chartPoints }) => (
					<Line points={chartPoints.y} color={String(color)} strokeWidth={2} curveType="linear" />
				)}
			</CartesianChart>
		</TrendFrame>
	);
}
