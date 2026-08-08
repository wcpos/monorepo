import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useT } from '@wcpos/core/contexts/translations';

export type TrendPoint = { x: number; y: number };

/** Two samples make a line — below that there is no trend to draw. */
export const MIN_TREND_POINTS = 2;

const defaultFormatValue = (value: number) => value.toLocaleString();

/**
 * The frame every Store health trend lives in: a label/latest header row over a
 * fixed-height plot area tall enough to carry real axes.
 *
 * The frame is drawn from the first render, before there is anything to plot —
 * a chart that appears only once history exists reads as a broken page on a
 * fresh till. Under two samples the plot area carries a quiet "not enough data
 * yet" line instead of a drawn one: never a fabricated flatline, and never a
 * placeholder shape that could be mistaken for measurement. The header still
 * reports the genuine latest value when one exists — a single sample is not a
 * trend, but it is still true.
 *
 * Populating the frame is purely additive (line replaces the waiting line
 * inside the same footprint), so nothing on the page moves when data arrives.
 */
export function TrendFrame({
	points,
	label,
	testID,
	formatValue = defaultFormatValue,
	children,
}: {
	points: TrendPoint[];
	label: string;
	testID: string;
	/** Formats the latest value (and, in the chart, the y-axis ticks). */
	formatValue?: (value: number) => string;
	/** The drawn trend. Omitted while the chart engine loads (web). */
	children?: React.ReactNode;
}) {
	const t = useT();
	const latest = points.at(-1);

	return (
		<View testID={testID} className="gap-2">
			<HStack className="items-baseline justify-between">
				<Text testID={`${testID}-label`} className="text-sm font-medium">
					{label}
				</Text>
				<Text testID={`${testID}-latest`} className="text-sm font-semibold">
					{latest !== undefined ? formatValue(latest.y) : '—'}
				</Text>
			</HStack>
			<View className="h-40">
				{points.length >= MIN_TREND_POINTS ? (
					children
				) : (
					<View className="bg-muted/30 flex-1 items-center justify-center rounded-md">
						<Text testID={`${testID}-waiting`} className="text-muted-foreground text-xs">
							{t('health.performance.trend_not_enough_data')}
						</Text>
					</View>
				)}
			</View>
		</View>
	);
}
