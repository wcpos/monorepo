import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';
import { useT } from '@wcpos/core/contexts/translations';
import { useLocalDate } from '@wcpos/core/hooks/use-local-date';

import type { UptimeCell } from './performance-logic';

/**
 * The theme's `ok` / `warn` tokens (CODING_STANDARDS § Design 7: never a hex in a
 * component), with glyphs as the secondary encoding so colour never stands alone.
 * The #843 palette was exact hexes; the tokens follow light, dark and every theme.
 * A red "stalled while open" state is reserved until the hourly heartbeat rollups
 * exist to prove "open but not running".
 */

function CellView({ cell, tooltip }: { cell: UptimeCell; tooltip: string }) {
	const body =
		cell.state === 'running' ? (
			<View className="bg-ok h-6 rounded opacity-75" />
		) : cell.state === 'errors' ? (
			<View className="border-warn h-6 items-center justify-center rounded border">
				<Text className="text-warn text-xs">⚠</Text>
			</View>
		) : (
			<View className="border-border h-6 rounded border" />
		);

	// The Root's wrapper view carries the flex sizing (a plain flex-1 on the
	// trigger dies inside the primitive's wrapper); cell bodies fill the width
	// by cross-axis stretch. showOnNative: the hourly numbers must be reachable
	// by press on iOS/Android, not just by assistive tech.
	return (
		<Tooltip showOnNative className="min-w-1.5 flex-1">
			<TooltipTrigger asChild>
				<View accessibilityLabel={tooltip} className="min-w-1.5 flex-1">
					{body}
				</View>
			</TooltipTrigger>
			<TooltipContent>
				<Text className="text-xs">{tooltip}</Text>
			</TooltipContent>
		</Tooltip>
	);
}

/** Hourly engine-uptime strip: one cell per trailing hour, glyph legend below. */
export function UptimeStrip({ cells }: { cells: UptimeCell[] }) {
	const t = useT();
	const { formatDate } = useLocalDate();

	const hourLabel = React.useCallback((ms: number) => formatDate(new Date(ms), 'p'), [formatDate]);
	const tooltipFor = React.useCallback(
		(cell: UptimeCell) => {
			const hour = hourLabel(cell.hourStartMs);
			if (cell.state === 'closed') {
				return t('health.performance.uptime_closed_tip', {
					hour,
				});
			}
			if (cell.state === 'errors') {
				return t('health.performance.uptime_errors_tip', {
					hour,
					n: cell.requests.toLocaleString(),
					e: cell.errors.toLocaleString(),
				});
			}
			return t('health.performance.uptime_running_tip', {
				hour,
				n: cell.requests.toLocaleString(),
			});
		},
		[hourLabel, t]
	);

	const first = cells[0];
	const middle = cells[Math.floor(cells.length / 2)];

	return (
		<VStack testID="uptime-strip" className="gap-1.5">
			<HStack className="items-end gap-[3px]">
				{cells.map((cell) => (
					<CellView key={cell.hourStartMs} cell={cell} tooltip={tooltipFor(cell)} />
				))}
			</HStack>
			<HStack className="justify-between">
				<Text className="text-muted-foreground/80 font-mono text-xs">
					{first ? hourLabel(first.hourStartMs) : ''}
				</Text>
				<Text className="text-muted-foreground/80 font-mono text-xs">
					{middle ? hourLabel(middle.hourStartMs) : ''}
				</Text>
				<Text className="text-muted-foreground/80 font-mono text-xs">
					{t('health.performance.uptime_now')}
				</Text>
			</HStack>
			<HStack className="flex-wrap gap-x-4 gap-y-1">
				<HStack className="items-center gap-1.5">
					<View className="bg-ok h-3 w-3 rounded-sm opacity-75" />
					<Text className="text-muted-foreground text-xs">
						{t('health.performance.uptime_running')}
					</Text>
				</HStack>
				<HStack className="items-center gap-1.5">
					<View className="border-warn h-3 w-3 rounded-sm border" />
					<Text className="text-muted-foreground text-xs">
						{t('health.performance.uptime_errors')}
					</Text>
				</HStack>
				<HStack className="items-center gap-1.5">
					<View className="border-border h-3 w-3 rounded-sm border" />
					<Text className="text-muted-foreground text-xs">
						{t('health.performance.uptime_closed')}
					</Text>
				</HStack>
			</HStack>
		</VStack>
	);
}
