import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { ScrollViewProps } from 'react-native';

import { isToday } from 'date-fns';
import { useObservableSuspense } from 'observable-hooks';

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

type LedgerResource = ObservableResource<QueryResult<RxCollection>>;

export function useLevelLabel(): (kind: LevelKind) => string {
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

/**
 * No actor part on purpose (A1.4): the log DB is per-(site, store, cashier),
 * so the ledger is always the viewing cashier's own — a name here is noise.
 * Attribution stays in the data for export and support.
 */
function Subline({ row, includeDuration }: { row: LogRow; includeDuration: boolean }) {
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

	if (includeDuration) {
		const duration = formatDurationMs(row.durationMs);
		if (duration) {
			parts.push(
				<Text key="dur" className="text-muted-foreground/80 font-mono text-xs">
					{duration}
				</Text>
			);
		}
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

/**
 * STATUS cell (A1.4, layout B2): the row's outcome at a glance — code chip on
 * problems, ✓ ok on successful outcomes, an em-dash otherwise. The chevron is
 * the expand hint; the press target is the whole row.
 */
function StatusCell({
	row,
	kind,
	expanded,
	onPress,
}: {
	row: LogRow;
	kind: LevelKind;
	expanded: boolean;
	onPress: () => void;
}) {
	const hasCode = Boolean(row.code) && (kind === 'error' || kind === 'warn');
	let content: React.ReactNode;
	if (hasCode && row.code) {
		content = <CodeChip code={row.code} onPress={onPress} testID={`logs-code-${row.logId}`} />;
	} else if (row.outcome === 'ok' && (kind === 'info' || kind === 'action')) {
		content = (
			<Text testID={`logs-ok-${row.logId}`} className="text-success text-xs font-semibold">
				✓ ok
			</Text>
		);
	} else {
		content = <Text className="text-muted-foreground/50 text-xs">—</Text>;
	}
	// box-none + passive children: only the code chip captures presses — the ok
	// mark, dash and chevron fall through to the whole-row press target below.
	return (
		<HStack pointerEvents="box-none" className="items-center justify-end gap-1.5">
			{hasCode ? content : <View pointerEvents="none">{content}</View>}
			<View pointerEvents="none">
				<Icon
					name={expanded ? 'chevronDown' : 'chevronRight'}
					size="sm"
					className="text-muted-foreground/60"
				/>
			</View>
		</HStack>
	);
}

/**
 * Tappable LEVEL pill (A1.5): tap filters the ledger to exactly this display
 * kind, composing with the active preset; tapping the active pill clears it.
 */
function LevelPill({
	row,
	kind,
	label,
	active,
	onPress,
}: {
	row: LogRow;
	kind: LevelKind;
	label: string;
	active: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			testID={`logs-pill-${row.logId}`}
			accessibilityRole="button"
			accessibilityState={{ selected: active }}
			onPress={onPress}
			className={cn(
				'-mx-1.5 self-start rounded-full px-1.5 py-0.5',
				'web:hover:bg-muted/60',
				active && 'bg-muted'
			)}
		>
			<LevelIndicator kind={kind} label={label} />
		</Pressable>
	);
}

function LedgerRow({
	row,
	chained,
	expanded,
	onToggle,
	timeText,
	levelLabel,
	title,
	kindActive,
	onKindPress,
}: {
	row: LogRow;
	chained: boolean;
	expanded: boolean;
	onToggle: () => void;
	timeText: string;
	levelLabel: string;
	title: string;
	kindActive: boolean;
	onKindPress: (kind: LevelKind) => void;
}) {
	const kind = displayKind(row);

	return (
		<View
			className={cn(
				'border-border/50 border-b border-l-2 pl-2',
				chained ? 'border-l-info/30' : 'border-l-transparent'
			)}
		>
			{/* md+ — table row. The whole row is the press target: a full-bleed
			    pressable overlay sits ABOVE the static cells, and the interactive
			    children (level pill, code chip) float above the overlay — nested
			    <button> is invalid DOM on web, so siblings-by-z-order it is. */}
			<View className="web:hover:bg-muted/20 relative hidden md:flex">
				<HStack className="items-baseline gap-3 py-2">
					<Text className="text-muted-foreground w-20 font-mono text-xs tabular-nums">
						{timeText}
					</Text>
					<View className="z-20 w-16">
						<LevelPill
							row={row}
							kind={kind}
							label={levelLabel}
							active={kindActive}
							onPress={() => onKindPress(kind)}
						/>
					</View>
					<View className="min-w-0 flex-1">
						<Text>{title}</Text>
						<Subline row={row} includeDuration={false} />
					</View>
					<Text className="text-muted-foreground w-16 text-right font-mono text-xs tabular-nums">
						{formatDurationMs(row.durationMs) ?? '—'}
					</Text>
					<View pointerEvents="box-none" className="z-20 w-32">
						<StatusCell row={row} kind={kind} expanded={expanded} onPress={onToggle} />
					</View>
				</HStack>
				<Pressable
					testID={`logs-row-${row.logId}`}
					accessibilityRole="button"
					accessibilityState={{ expanded }}
					accessibilityLabel={`${timeText} · ${levelLabel} · ${title}`}
					onPress={onToggle}
					className="absolute inset-0 z-10"
				/>
			</View>

			{/* below md — two-line pressable row; the status badge overlays the first
			    line as a sibling, and the duration stays in the subline (B2 mobile). */}
			<View className="relative md:hidden">
				<Pressable
					testID={`logs-row-sm-${row.logId}`}
					accessibilityRole="button"
					onPress={onToggle}
					className="gap-0.5 py-2"
				>
					<HStack className="items-center gap-2 pr-32">
						<Text className="text-muted-foreground font-mono text-xs tabular-nums">{timeText}</Text>
						{/* Dot-only for space, but the kind still reads to assistive tech. */}
						<LevelIndicator kind={kind} accessibilityLabel={levelLabel} />
					</HStack>
					<Text className="text-sm">{title}</Text>
					<Subline row={row} includeDuration />
				</Pressable>
				<View pointerEvents="box-none" className="absolute top-2 right-0 z-10">
					<StatusCell row={row} kind={kind} expanded={expanded} onPress={onToggle} />
				</View>
			</View>

			{expanded ? <RowDetail row={row} kind={kind} title={title} /> : null}
		</View>
	);
}

/**
 * The flat ledger (TIME / LEVEL / EVENT / TOOK / STATUS — layout B2, map
 * #1136): hairline rows, chain edge-marks, whole-row expand, tappable level
 * pills, inline detail. Pagination is driven by the row-only ScrollView (no
 * "Show more" button); the header and honest-count footer stay pinned.
 */
export function Ledger({
	resource,
	activeKind,
	onKindPress,
	onRenderedCount,
	onScroll,
	onContentSizeChange,
	onLayout,
	scrollEventThrottle,
}: {
	resource: LedgerResource;
	activeKind: LevelKind | undefined;
	onKindPress: (kind: LevelKind) => void;
	onRenderedCount?: (count: number) => void;
	onScroll?: ScrollViewProps['onScroll'];
	onContentSizeChange?: ScrollViewProps['onContentSizeChange'];
	onLayout?: ScrollViewProps['onLayout'];
	scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
}) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const result = useObservableSuspense(resource);
	const levelLabel = useLevelLabel();
	const eventTitle = useEventTitle();
	const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

	const rows = React.useMemo(
		() => result.hits.map((hit) => (hit.record as { toJSON(): LogRow }).toJSON()),
		[result.hits]
	);
	const chained = React.useMemo(() => chainMarkedIds(rows), [rows]);

	// Effect (last resort): the screen's infinite-scroll guard must know how many
	// rows actually MATERIALIZED — the query limit moves before rows do, which is
	// exactly the gap the one-extend-per-window protection exists to close.
	React.useEffect(() => {
		onRenderedCount?.(rows.length);
	}, [onRenderedCount, rows.length]);

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
		<VStack testID="logs-ledger" className="min-h-0 flex-1 gap-0">
			<HairlineHeaderRow className="hidden pl-2 md:flex">
				<HairlineHeaderCell testID="logs-heading-time" className="w-20">
					{t('health.logs.col_time')}
				</HairlineHeaderCell>
				<HairlineHeaderCell testID="logs-heading-level" className="w-16">
					{t('health.logs.col_level')}
				</HairlineHeaderCell>
				<HairlineHeaderCell testID="logs-heading-event" className="flex-1">
					{t('health.logs.col_event')}
				</HairlineHeaderCell>
				<HairlineHeaderCell testID="logs-heading-took" className="w-16 text-right">
					{t('health.logs.col_took')}
				</HairlineHeaderCell>
				<HairlineHeaderCell testID="logs-heading-status" className="w-32 text-right">
					{t('health.logs.col_status')}
				</HairlineHeaderCell>
			</HairlineHeaderRow>

			<ScrollView
				className="min-h-0 flex-1"
				onScroll={onScroll}
				onContentSizeChange={onContentSizeChange}
				onLayout={onLayout}
				scrollEventThrottle={scrollEventThrottle}
			>
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
							kindActive={activeKind !== undefined && displayKind(row) === activeKind}
							onKindPress={onKindPress}
						/>
					))
				)}
			</ScrollView>
		</VStack>
	);
}

/**
 * Pinned honest-count footer. Rendered by the screen OUTSIDE the ledger's
 * Suspense/error boundary so the count and the live status accessory stay
 * mounted while the log query is loading or broken. flex-wrap lets the
 * accessory drop to its own line instead of clipping on narrow layouts.
 */
export function LedgerFooter({
	shown,
	total,
	accessory,
}: {
	shown: number;
	total: number;
	accessory?: React.ReactNode;
}) {
	const t = useT();
	return (
		<HStack className="border-border/50 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t py-2">
			<Text className="text-muted-foreground text-xs">
				{t('common.showing_of', { shown, total })}
			</Text>
			<Text testID="logs-loaded-count" className="hidden">
				{shown}
			</Text>
			<Text testID="logs-total-count" className="hidden">
				{total}
			</Text>
			{accessory}
		</HStack>
	);
}
