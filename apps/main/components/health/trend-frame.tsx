import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useT } from '@wcpos/core/contexts/translations';

export type TrendPoint = { x: number; y: number };

/** Two samples make a line — below that there is no trend to draw. */
export const MIN_TREND_POINTS = 2;

/**
 * The frame every Store health trend lives in: a fixed-height plot area over
 * the approved mockup's baseline hairline, with the label/latest caption row
 * underneath (docs/mockups/2026-07-16-health-performance-page.html).
 *
 * The frame is drawn from the first render, before there is anything to plot —
 * a chart that appears only once history exists reads as a broken page on a
 * fresh till. Under two samples the plot area carries a quiet "not enough data
 * yet" line instead of a drawn one: never a fabricated flatline, and never a
 * placeholder shape that could be mistaken for measurement. The caption still
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
	children,
}: {
	points: TrendPoint[];
	label: string;
	testID: string;
	/** The drawn trend. Omitted while the chart engine loads (web). */
	children?: React.ReactNode;
}) {
	const t = useT();
	const latest = points.at(-1);

	return (
		<View testID={testID} className="gap-1">
			<View className="border-border/50 h-12 border-b">
				{points.length >= MIN_TREND_POINTS ? (
					children
				) : (
					<View className="flex-1 items-center justify-center">
						<Text testID={`${testID}-waiting`} className="text-muted-foreground text-xs">
							{t(
								'health.performance.trend_not_enough_data',
								'Not enough data yet — this trend fills in as the till runs'
							)}
						</Text>
					</View>
				)}
			</View>
			<HStack className="items-baseline justify-between">
				<Text testID={`${testID}-label`} className="text-muted-foreground text-xs">
					{label}
				</Text>
				<Text testID={`${testID}-latest`} className="text-muted-foreground text-xs">
					{latest !== undefined ? latest.y.toLocaleString() : '—'}
				</Text>
			</HStack>
		</View>
	);
}
