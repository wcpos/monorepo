import * as React from 'react';
import { Pressable, View } from 'react-native';

import { isToday } from 'date-fns';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { cn } from '@wcpos/components/lib/utils';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { QueryResult } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useLocalDate } from '../../../hooks/use-local-date';
import {
	CodeChip,
	HairlineHeaderCell,
	HairlineHeaderRow,
	LevelIndicator,
	type LevelKind,
	RepeatChip,
} from '../health/components';
import { useEventTitle } from './event-title';
import {
	chainMarkedIds,
	displayCategory,
	displayKind,
	formatDurationMs,
	type LogRow,
} from './logs-logic';
import { RowDetail } from './row-detail';

import type { ObservableResource } from 'observable-hooks';
import type { RxCollection } from 'rxdb';
import type { Observable } from 'rxjs';

type LedgerResource = ObservableResource<QueryResult<RxCollection>>;

function useLevelLabel(): (kind: LevelKind) => string {
	const t = useT();
	return React.useCallback(
		(kind: LevelKind) => {
			switch (kind) {
				case 'error':
					return t('health.logs.level_error');
				case 'warn':
					return t('health.logs.level_warn');
				case 'action':
					return t('health.logs.level_action');
				case 'sync':
					return t('health.logs.level_sync');
				case 'debug':
					return t('health.logs.level_debug');
				default:
					return t('health.logs.level_info');
			}
		},
		[t]
	);
}

function Subline({ row }: { row: LogRow }) {
	const context = row.context ?? {};
	const parts: React.ReactNode[] = [];
	const category = displayCategory(row.category);
	if (category)
		parts.push(
			<Text key="cat" className="text-muted-foreground/80 font-mono text-xs">
				{category}
			</Text>
		);

	const recordId = context.recordId;
	const collection = typeof context.collection === 'string' ? context.collection : null;
	if (collection && recordId !== undefined && recordId !== null) {
		parts.push(
			<Text key="rec" className="text-muted-foreground/80 font-mono text-xs">
				{`${collection}/${String(recordId)}`}
			</Text>
		);
	}

	const duration = formatDurationMs(row.durationMs);
	if (duration) {
		parts.push(
			<Text key="dur" className="text-muted-foreground/80 font-mono text-xs">
				{duration}
			</Text>
		);
	}

	if (row.actor?.name) {
		parts.push(
			<Text key="actor" className="text-action text-xs font-medium">
				{row.actor.name}
			</Text>
		);
	}

	if ((row.count ?? 1) > 1) {
		parts.push(<RepeatChip key="rep" count={row.count ?? 1} />);
	}

	if (parts.length === 0) return null;
	return (
		<HStack className="flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-0.5">
			{parts.map((part, index) => (
				<React.Fragment key={index}>
					{index > 0 ? <Text className="text-muted-foreground/50 text-xs">·</Text> : null}
					{part}
				</React.Fragment>
			))}
		</HStack>
	);
}

function CodeCell({ row, kind, onPress }: { row: LogRow; kind: LevelKind; onPress: () => void }) {
	if (row.code && (kind === 'error' || kind === 'warn')) {
		return <CodeChip code={row.code} onPress={onPress} testID={`logs-code-${row.logId}`} />;
	}
	if (row.outcome === 'ok' && (kind === 'info' || kind === 'action')) {
		return <Text className="text-success text-right text-xs font-semibold">✓ ok</Text>;
	}
	return null;
}

function LedgerRow({
	row,
	chained,
	expanded,
	onToggle,
	timeText,
	levelLabel,
	title,
}: {
	row: LogRow;
	chained: boolean;
	expanded: boolean;
	onToggle: () => void;
	timeText: string;
	levelLabel: string;
	title: string;
}) {
	const kind = displayKind(row);

	return (
		<View
			className={cn(
				'border-border/50 border-b border-l-2 pl-2',
				chained ? 'border-l-info/30' : 'border-l-transparent'
			)}
		>
			{/* md+ — table row */}
			<HStack testID={`logs-row-${row.logId}`} className="hidden items-baseline gap-3 py-2 md:flex">
				<Text className="text-muted-foreground w-20 font-mono text-xs tabular-nums">
					{timeText}
				</Text>
				<View className="w-16">
					<LevelIndicator kind={kind} label={levelLabel} />
				</View>
				<View className="min-w-0 flex-1">
					<Text>{title}</Text>
					<Subline row={row} />
				</View>
				<View className="w-24 items-end">
					<CodeCell row={row} kind={kind} onPress={onToggle} />
				</View>
				<Pressable
					testID={`logs-expand-${row.logId}`}
					accessibilityRole="button"
					onPress={onToggle}
					className="w-6 items-center py-0.5"
				>
					<Icon
						name={expanded ? 'chevronDown' : 'chevronRight'}
						size="sm"
						className="text-muted-foreground/60"
					/>
				</Pressable>
			</HStack>

			{/* below md — two-line pressable row */}
			<HStack className="items-start gap-2 py-2 md:hidden">
				<Pressable
					testID={`logs-row-sm-${row.logId}`}
					accessibilityRole="button"
					onPress={onToggle}
					className="min-w-0 flex-1 gap-0.5"
				>
					<HStack className="items-center gap-2">
						<Text className="text-muted-foreground font-mono text-xs tabular-nums">{timeText}</Text>
						{/* Dot-only for space, but the kind still reads to assistive tech. */}
						<LevelIndicator kind={kind} accessibilityLabel={levelLabel} />
					</HStack>
					<Text className="text-sm">{title}</Text>
					<Subline row={row} />
				</Pressable>
				<View className="items-end">
					<CodeCell row={row} kind={kind} onPress={onToggle} />
				</View>
			</HStack>

			{expanded ? <RowDetail row={row} kind={kind} title={title} /> : null}
		</View>
	);
}

/**
 * The flat ledger (TIME / LEVEL / EVENT / CODE): hairline rows, chain
 * edge-marks for adjacent rows in one operation, inline expandable detail.
 */
export function Ledger({
	resource,
	total$,
	onShowMore,
}: {
	resource: LedgerResource;
	total$: Observable<number>;
	onShowMore: () => void;
}) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const result = useObservableSuspense(resource);
	const total = useObservableState(total$, 0);
	const levelLabel = useLevelLabel();
	const eventTitle = useEventTitle();
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

	const rows = React.useMemo(
		() => result.hits.map((hit) => (hit.document as { toJSON(): LogRow }).toJSON()),
		[result.hits]
	);
	const chained = React.useMemo(() => chainMarkedIds(rows), [rows]);

	const timeTextFor = React.useCallback(
		(timestamp: number) => {
			const date = new Date(timestamp);
			return formatDate(date, isToday(date) ? 'p' : 'MMM d, p');
		},
		[formatDate]
	);

	const toggle = React.useCallback((logId: string) => {
		setExpanded((previous) => ({ ...previous, [logId]: !previous[logId] }));
	}, []);

	return (
		<VStack testID="logs-ledger" className="gap-0">
			<HairlineHeaderRow className="hidden pl-2 md:flex">
				<HairlineHeaderCell className="w-20">{t('health.logs.col_time')}</HairlineHeaderCell>
				<HairlineHeaderCell className="w-16">{t('health.logs.col_level')}</HairlineHeaderCell>
				<HairlineHeaderCell className="flex-1">{t('health.logs.col_event')}</HairlineHeaderCell>
				<HairlineHeaderCell className="w-24 text-right">
					{t('health.logs.col_code')}
				</HairlineHeaderCell>
				<View className="w-6" />
			</HairlineHeaderRow>

			{rows.length === 0 ? (
				<Text className="text-muted-foreground py-6 text-center text-sm">
					{t('logs.no_logs_found')}
				</Text>
			) : (
				rows.map((row) => (
					<LedgerRow
						key={row.logId}
						row={row}
						chained={chained.has(row.logId)}
						expanded={!!expanded[row.logId]}
						onToggle={() => toggle(row.logId)}
						timeText={timeTextFor(row.timestamp)}
						levelLabel={levelLabel(displayKind(row))}
						title={eventTitle(row)}
					/>
				))
			)}

			<HStack className="items-center justify-between py-3">
				<Text className="text-muted-foreground text-xs">
					{t('common.showing_of', { shown: rows.length, total })}
				</Text>
				{rows.length < total ? (
					<Button variant="ghost" size="sm" testID="logs-show-more" onPress={onShowMore}>
						<ButtonText>{t('health.logs.show_more')}</ButtonText>
					</Button>
				) : null}
			</HStack>
		</VStack>
	);
}
