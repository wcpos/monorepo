import * as React from 'react';
import { View } from 'react-native';

import { useCSSVariable } from 'uniwind';
import { CartesianChart, Line } from 'victory-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useT } from '@wcpos/core/contexts/translations';

import { trendDisplay, type TrendPoint } from './performance-logic';

export type { TrendPoint };

/**
 * A quiet sparkline for the Store health trends — one hue, no axes, no grid;
 * the caption row carries the label and the latest value (colour is meaning:
 * accent = the POS's own activity, neutral ink = the server's context).
 *
 * Below two samples there is no trend to draw, so the card holds its shape with
 * a muted placeholder line labelled "Waiting for more data". The placeholder is
 * decorative: it is drawn in neutral ink whatever the tone, so it can't be read
 * as the accent-coloured real thing, and the caption still reports the genuine
 * latest value when one exists.
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
	const t = useT();
	const accent = useCSSVariable('--color-primary');
	const neutral = useCSSVariable('--color-muted-foreground');
	const display = trendDisplay(points);
	const isPlaceholder = display.mode === 'placeholder';
	const color = isPlaceholder || tone === 'neutral' ? neutral : accent;

	const caption = (
		<HStack className="items-baseline justify-between">
			<Text className="text-muted-foreground text-xs">{label}</Text>
			<Text className="text-muted-foreground text-xs">
				{display.latest !== null ? display.latest.toLocaleString() : '—'}
			</Text>
		</HStack>
	);

	const chart = (
		<CartesianChart
			data={display.points}
			xKey="x"
			yKeys={['y']}
			domainPadding={{ top: 4, bottom: 4 }}
		>
			{({ points: chartPoints }) => (
				<Line points={chartPoints.y} color={String(color)} strokeWidth={2} curveType="linear" />
			)}
		</CartesianChart>
	);

	if (isPlaceholder) {
		return (
			<View testID={testID} className="gap-1">
				<View className="h-12">
					<View className="absolute inset-0 opacity-25">{chart}</View>
					<View className="absolute inset-0 items-center justify-center">
						<Text testID={`${testID}-waiting`} className="text-muted-foreground text-xs">
							{t('health.performance.waiting_for_data', 'Waiting for more data')}
						</Text>
					</View>
				</View>
				{caption}
			</View>
		);
	}

	return (
		<View testID={testID} className="gap-1">
			<View className="h-12">{chart}</View>
			{caption}
		</View>
	);
}
