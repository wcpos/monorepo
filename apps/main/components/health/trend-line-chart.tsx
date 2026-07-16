import * as React from 'react';
import { View } from 'react-native';

import { useCSSVariable } from 'uniwind';
import { CartesianChart, Line } from 'victory-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

export type TrendPoint = { x: number; y: number };

/**
 * A quiet sparkline for the Store health trends — one hue, no axes, no grid;
 * the caption row carries the label and the latest value (colour is meaning:
 * accent = the POS's own activity, neutral ink = the server's context).
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
	const latest = points.at(-1);

	if (points.length < 2) {
		// A single sample isn't a trend — the caption row alone tells the truth.
		return (
			<HStack testID={testID} className="items-baseline justify-between">
				<Text className="text-muted-foreground text-xs">{label}</Text>
				<Text className="text-muted-foreground text-xs">
					{latest ? latest.y.toLocaleString() : '—'}
				</Text>
			</HStack>
		);
	}

	return (
		<View testID={testID} className="gap-1">
			<View className="h-12">
				<CartesianChart data={points} xKey="x" yKeys={['y']} domainPadding={{ top: 4, bottom: 4 }}>
					{({ points: chartPoints }) => (
						<Line points={chartPoints.y} color={String(color)} strokeWidth={2} curveType="linear" />
					)}
				</CartesianChart>
			</View>
			<HStack className="items-baseline justify-between">
				<Text className="text-muted-foreground text-xs">{label}</Text>
				<Text className="text-muted-foreground text-xs">
					{latest ? latest.y.toLocaleString() : '—'}
				</Text>
			</HStack>
		</View>
	);
}
