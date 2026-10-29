import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { ScrollViewProps } from 'react-native';

import { isToday } from 'date-fns/isToday';

import { EmptyState } from '@wcpos/components/empty-state';
import { Badge } from '@wcpos/components/badge';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { cn } from '@wcpos/components/lib/utils';
import { HStack } from '@wcpos/components/hstack';
import { useIsPhone } from '@wcpos/components/lib/device';
import { Icon } from '@wcpos/components/icon';
import { Loader } from '@wcpos/components/loader';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Suspense } from '@wcpos/components/suspense';
import { TableHead, TableHeader, TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { QueryHandle } from '@wcpos/query';
import { CodeChip } from '@wcpos/components/code-chip';

import { useT } from '../../../contexts/translations';
import { useLocalDate } from '../../../hooks/use-local-date';
import { useDrawnHandle, useQuerySnapshot } from '../../../query';
import { useRecordLabel } from '../health/use-record-label';
import { useEventTitle } from './event-title';
import {
	chainMarkedIds,
	displayCategory,
	displayKind,
	formatDurationMs,
	type LevelKind,
	type LogRow,
	recordRefOf,
} from './logs-logic';
import { RowDetail } from './row-detail';

// The level's dot from the tone map; an actor's row takes the accent.
const LEVEL_TONE = {
	info: 'muted',
	warn: 'warning',
	error: 'bad',
	action: 'default',
	sync: 'info',
	debug: 'muted',
} as const satisfies Record<LevelKind, string>;

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
function Subline({
	row,
	includeDuration,
	recordText,
	recordTestID,
}: {
	row: LogRow;
	includeDuration: boolean;
	/** The record by name ("Order: #1234 · 45.00"), resolved once per row. */
	recordText: string | null;
	recordTestID: string;
}) {
	const parts: React.ReactNode[] = [];
	const category = displayCategory(row.category);
	if (category)
		parts.push(
			<Text key="cat" className="text-muted-foreground/80 font-mono text-xs">
				{category}
			</Text>
		);

	// By name, never `orders/ae263330-…` — a merchant cannot act on a uuid
	// (2026-10-17); the raw id stays in the row's Details.
	if (recordText) {
		parts.push(
			<Text key="rec" testID={recordTestID} className="text-muted-foreground/80 text-xs" decodeHtml>
				{recordText}
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
		parts.push(<Badge key="rep" variant="muted">{`×${(row.count ?? 1).toLocaleString()}`}</Badge>);
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
			<StatusBadge size="caption" variant={LEVEL_TONE[kind]} label={label} />
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
	// Once per row: both responsive layouts are mounted, so resolving inside the
	// subline would read the record twice.
	const record = recordRefOf(row);
	const recordText = useRecordLabel(record?.collectionName, record?.recordId)?.text ?? null;
	const phone = useIsPhone();

	return (
		<View
			className={cn(
				'border-border/50 border-b border-l-2 pl-2',
				chained ? 'border-l-info/30' : 'border-l-transparent'
			)}
		>
			{/* Off a phone — table row. The whole row is the press target: a full-bleed
			    pressable overlay sits ABOVE the static cells, and the interactive
			    children (level pill, code chip) float above the overlay — nested
			    <button> is invalid DOM on web, so siblings-by-z-order it is. */}
			<View className={cn('web:hover:bg-muted/20 relative', phone && 'hidden')}>
				<HStack className="items-baseline gap-3 py-2">
					<Text variant="help" tabular className="w-20 font-mono">
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
						<Subline
							row={row}
							includeDuration={false}
							recordText={recordText}
							recordTestID={`logs-record-${row.logId}`}
						/>
					</View>
					<Text variant="help" tabular className="w-16 text-right font-mono">
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

			{/* On a phone — two-line pressable row; the status badge overlays the first
			    line as a sibling, and the duration stays in the subline (B2 mobile). */}
			<View className={cn('relative', !phone && 'hidden')}>
				<Pressable
					testID={`logs-row-sm-${row.logId}`}
					accessibilityRole="button"
					onPress={onToggle}
					className="gap-0.5 py-2"
				>
					<HStack className="items-center gap-2 pr-32">
						<Text variant="help" tabular className="font-mono">
							{timeText}
						</Text>
						<StatusBadge size="caption" variant={LEVEL_TONE[kind]} label={levelLabel} />
					</HStack>
					<Text className="text-sm">{title}</Text>
					<Subline
						row={row}
						includeDuration
						recordText={recordText}
						recordTestID={`logs-record-sm-${row.logId}`}
					/>
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
	handle,
	activeKind,
	onKindPress,
	onRenderedCount,
	onScroll,
	onContentSizeChange,
	onLayout,
	scrollEventThrottle,
}: {
	handle: QueryHandle;
	activeKind: LevelKind | undefined;
	onKindPress: (kind: LevelKind) => void;
	onRenderedCount?: (count: number) => void;
	onScroll?: ScrollViewProps['onScroll'];
	onContentSizeChange?: ScrollViewProps['onContentSizeChange'];
	onLayout?: ScrollViewProps['onLayout'];
	scrollEventThrottle?: ScrollViewProps['scrollEventThrottle'];
}) {
	const t = useT();
	const phone = useIsPhone();
	const { formatDate } = useLocalDate();
	// Drawn, not live: a changed filter's new handle answers while the previous rows stay.
	const drawn = useDrawnHandle(handle);
	const result = useQuerySnapshot(drawn, []);
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
			{/* The shared table head, flush (`px-0`) over the rows' own `gap-3` gutter; the
			    transparent left edge is the rows' chain mark, so the heads sit over their cells. */}
			<TableHeader className={cn(phone && 'hidden')}>
				<TableRow className="items-center gap-3 border-l-2 border-l-transparent pl-2">
					<TableHead testID="logs-heading-time" className="w-20 flex-none px-0">
						<Text>{t('health.logs.col_time')}</Text>
					</TableHead>
					<TableHead testID="logs-heading-level" className="w-16 flex-none px-0">
						<Text>{t('health.logs.col_level')}</Text>
					</TableHead>
					<TableHead testID="logs-heading-event" className="min-w-0 px-0">
						<Text>{t('health.logs.col_event')}</Text>
					</TableHead>
					<TableHead testID="logs-heading-took" className="w-16 flex-none items-end px-0">
						<Text>{t('health.logs.col_took')}</Text>
					</TableHead>
					<TableHead testID="logs-heading-status" className="w-32 flex-none items-end px-0">
						<Text>{t('health.logs.col_status')}</Text>
					</TableHead>
				</TableRow>
			</TableHeader>

			<ScrollView
				className="min-h-0 flex-1"
				onScroll={onScroll}
				onContentSizeChange={onContentSizeChange}
				onLayout={onLayout}
				scrollEventThrottle={scrollEventThrottle}
			>
				{rows.length === 0 ? (
					<EmptyState
						kind="empty"
						size="inline"
						title={t('logs.no_logs_found')}
						className="justify-center py-6"
					/>
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
 * The ledger inside its own boundaries, the way the screen mounts it. A failed read reaches the
 * error boundary; its reset asks the handle again (`retry` withdraws the stored failure, so the
 * remounted reader waits on the new read instead of rethrowing the old one), and a new handle —
 * a changed filter or search — resets it too.
 */
export function LedgerPane(props: React.ComponentProps<typeof Ledger>) {
	const { handle } = props;
	return (
		<ErrorBoundary onReset={() => handle.retry()} resetKeys={[handle]}>
			<Suspense
				fallback={
					<View className="min-h-0 flex-1 items-center justify-center py-8">
						<Loader />
					</View>
				}
			>
				<Ledger {...props} />
			</Suspense>
		</ErrorBoundary>
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
			<Text variant="help">
				{/* Grouped to match every other footer and the Database page; the hidden
				    markers below stay raw digits for E2E. */}
				{t('common.showing_of', {
					shown: shown.toLocaleString(),
					total: total.toLocaleString(),
				})}
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
