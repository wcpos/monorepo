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
 * CVD-validated palette, locked on #843 — exact hexes, deliberately NOT theme
 * tokens, with glyphs as the secondary encoding so color never stands alone.
 * Red (#dc2626, ✕ stalled-while-open) is reserved until the hourly heartbeat
 * rollups exist to prove "open but not running".
 */
const UPTIME_GREEN = '#15803d';
const UPTIME_AMBER = '#ca8a04';

function CellView({ cell, tooltip }: { cell: UptimeCell; tooltip: string }) {
	const body =
		cell.state === 'running' ? (
			<View className="h-6 rounded" style={{ backgroundColor: UPTIME_GREEN, opacity: 0.75 }} />
		) : cell.state === 'errors' ? (
			<View
				className="h-6 items-center justify-center rounded border"
				style={{ borderColor: UPTIME_AMBER }}
			>
				<Text className="text-[11px]" style={{ color: UPTIME_AMBER }}>
					⚠
				</Text>
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
				<Text className="text-muted-foreground/80 font-mono text-[11px]">
					{first ? hourLabel(first.hourStartMs) : ''}
				</Text>
				<Text className="text-muted-foreground/80 font-mono text-[11px]">
					{middle ? hourLabel(middle.hourStartMs) : ''}
				</Text>
				<Text className="text-muted-foreground/80 font-mono text-[11px]">
					{t('health.performance.uptime_now')}
				</Text>
			</HStack>
			<HStack className="flex-wrap gap-x-4 gap-y-1">
				<HStack className="items-center gap-1.5">
					<View
						className="h-3 w-3 rounded-sm"
						style={{ backgroundColor: UPTIME_GREEN, opacity: 0.75 }}
					/>
					<Text className="text-muted-foreground text-xs">
						{t('health.performance.uptime_running')}
					</Text>
				</HStack>
				<HStack className="items-center gap-1.5">
					<View className="h-3 w-3 rounded-sm border" style={{ borderColor: UPTIME_AMBER }} />
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
