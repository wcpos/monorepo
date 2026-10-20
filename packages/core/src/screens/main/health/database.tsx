import * as React from 'react';
import { Pressable, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Badge } from '@wcpos/components/badge';
import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Loader } from '@wcpos/components/loader';
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';
import { cn } from '@wcpos/components/lib/utils';
import { COLLECTION_VOCABULARY, resetCollectionsAndRefill, useQueryRuntime } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { HISTORY_DAYS } from '@wcpos/sync-core';

import { AttentionPanel } from './attention-panel';
import { ConflictedMutationsPanel } from './conflicted-mutations';
import { useCollectionCheck, useManualSync } from './use-manual-sync';
import { mergeStuckRecords, useDeadLetterStuckRecords } from './use-dead-letter-attention';
import { useUnresolvedConflictKeys } from './use-unresolved-conflicts';
import { useT } from '../../../contexts/translations';
import { AreaPage } from '../components/navigation-area/area-page';
import { formatSkewMagnitude } from '../logs/logs-logic';
import { useLogStats } from '../logs/use-log-stats';
import { useCensusTotals } from '../hooks/use-census-totals';
import {
	useCollectionCounts,
	useEngineStatus,
	useMutationCounts,
} from '../hooks/use-engine-monitor';
import { Callout, CoverageBar, Stat, StatHeader } from './components';
import {
	censusFreshnessWindow,
	censusRefreshDue,
	censusWindowProgress,
	type CollectionKey,
	type CollectionRow,
	deriveRows,
	formatBytes,
	isReadyToSell,
	isServerBackingOff,
	stuckCountsByRow,
	totalLocalRecords,
} from './database-logic';
import { QueuedEmailsPanel } from './queued-emails';
import { RegistersPanel } from './registers-panel';
import { RejectedMutationsPanel } from './rejected-mutations';
import { useCollectionSizes } from './use-collection-sizes';
import { useNowMs, useRelativeTime } from './use-relative-time';
import { useStorageFootprint } from './use-storage-footprint';

const databaseLogger = getLogger(['wcpos', 'health', 'database']);

function exhaustiveCollectionOrder<const Order extends readonly CollectionKey[]>(
	order: Exclude<CollectionKey, Order[number]> extends never ? Order : never
): Order {
	return order;
}

const ROW_ORDER = exhaustiveCollectionOrder([
	'products',
	'variations',
	'orders',
	'refunds',
	'customers',
	'categories',
	'brands',
	'tags',
	'coupons',
	'taxRates',
]);

const ROW_LABEL_KEYS = Object.fromEntries(
	Object.entries(COLLECTION_VOCABULARY).map(([name, row]) => [name, row.labelKey])
) as Record<CollectionKey, string>;

type RowPhase = 'idle' | 'clearing';

type RowCoverage =
	| { kind: 'clearing' | 'checking' | 'empty' | 'none'; label: string }
	| {
			kind: 'complete' | 'partial' | 'windowed';
			percent: number;
			tooltip: string;
	  };

type RowStory = { serverText: string; coverage: RowCoverage };

/**
 * The "on server" + "coverage" story for one row, shared by the table (md+)
 * and list (sm) layouts. Every branch states something true:
 * - orders and variations show the real server total plus their policy
 *   (open + recent stay local / variations download with their products)
 * - a stale/missing census reads "checking…", never "unknown"
 * - an empty fresh census reads "—" (nothing to mirror)
 */
function useRowStory(row: CollectionRow, phase: RowPhase, backingOff: boolean): RowStory {
	const t = useT();
	if (phase === 'clearing') {
		return {
			serverText: row.serverTotal !== null ? row.serverTotal.toLocaleString() : '—',
			coverage: {
				kind: 'clearing',
				label: t('health.database.redownloading'),
			},
		};
	}
	if (!row.fresh || row.serverTotal === null) {
		// A stale census keeps its last-known total on screen (a number the
		// server DID report) while "checking…" replaces the bar — never a green
		// bar off a stale denominator, never a bare "…" when we knew a total.
		return {
			serverText: row.serverTotal !== null ? row.serverTotal.toLocaleString() : '…',
			coverage: {
				kind: 'checking',
				label: backingOff ? t('health.database.checking_busy') : t('health.database.checking'),
			},
		};
	}
	if (row.serverTotal === 0 && row.local === 0) {
		return {
			serverText: '0',
			coverage: { kind: 'empty', label: '—' },
		};
	}
	if (row.key === 'refunds') {
		return {
			serverText: row.serverTotal.toLocaleString(),
			coverage: { kind: 'none', label: t('health.database.window_short') },
		};
	}
	if (row.windowed) {
		const percent =
			row.serverTotal > 0 ? Math.min(100, Math.round((row.local / row.serverTotal) * 100)) : 0;
		return {
			serverText: row.serverTotal.toLocaleString(),
			coverage: {
				kind: 'windowed',
				percent,
				tooltip:
					row.key === 'variations'
						? t('health.database.variations_tooltip', { p: percent })
						: t('health.database.window_tooltip', { p: percent }),
			},
		};
	}
	if (row.percentLocal !== null && row.percentLocal >= 100) {
		return {
			serverText: row.serverTotal.toLocaleString(),
			coverage: {
				kind: 'complete',
				percent: 100,
				tooltip: t('health.database.all_tooltip'),
			},
		};
	}
	return {
		serverText: row.serverTotal.toLocaleString(),
		coverage: {
			kind: 'partial',
			percent: row.percentLocal ?? 0,
			tooltip: t('health.database.percent_tooltip', {
				p: row.percentLocal ?? 0,
			}),
		},
	};
}

/**
 * Bars-only coverage (spec §9): green full / blue partial; the words live in
 * a tooltip, and the Orders policy stays a subline on its row.
 */
function CoverageCell({ coverage }: { coverage: RowCoverage }) {
	switch (coverage.kind) {
		case 'clearing':
			return (
				<HStack className="items-center justify-end gap-2">
					<Loader size="sm" />
					<Text className="text-muted-foreground text-xs">{coverage.label}</Text>
				</HStack>
			);
		case 'complete':
		case 'partial':
		case 'windowed':
			return (
				<Tooltip showOnNative>
					<TooltipTrigger asChild>
						<Pressable accessibilityLabel={coverage.tooltip} className="items-end py-1">
							<CoverageBar percent={coverage.percent} />
						</Pressable>
					</TooltipTrigger>
					<TooltipContent>
						<Text className="text-xs">{coverage.tooltip}</Text>
					</TooltipContent>
				</Tooltip>
			);
		default:
			return <Text className="text-muted-foreground text-right text-xs">{coverage.label}</Text>;
	}
}

/**
 * The table row's fixed columns (on device 80 + on server 96 + coverage 128 + size 80 +
 * menu 36, five 12 px gaps) take 480 px before the collection column gets anything.
 * Below this width the collection column wrapped one character per line (portrait iPad
 * with the drawer rail open). The choice used to be the `md:` window breakpoint, but the
 * width that matters is the table's own: a tablet rail or an open drawer narrows the
 * content column without changing the window. 600 (the collection column keeps 120): inside
 * the page card (2026-10-18) the table measures about 638 in a 1024 window (rail 56, area
 * rail 224, page and card padding 106), which must keep the table, with room for a web
 * scrollbar; a 768 window measures about 382 and takes the compact rows, as it did before.
 */
const TABLE_LAYOUT_MIN_WIDTH = 600;

/** Measured container width → whether the table layout fits; compact until measured. */
function useTableLayout(): { wide: boolean; onLayout: (event: LayoutChangeEvent) => void } {
	const [wide, setWide] = React.useState(false);
	const onLayout = React.useCallback((event: LayoutChangeEvent) => {
		const next = event.nativeEvent.layout.width >= TABLE_LAYOUT_MIN_WIDTH;
		setWide((previous) => (previous === next ? previous : next));
	}, []);
	return { wide, onLayout };
}

/**
 * The wide layout's columns, shared by the heads, the collection rows and the storage
 * lines so they line up. The shared table's cells, flush (`px-0`): the row's `gap-3` is
 * the gutter, as the hairline layout had it, and the actions column is the menu button's
 * own width (`w-ctl`), so the heads no longer sit 8 px right of the numbers under them.
 */
const DB_ROW = 'items-center gap-3 py-2';
const DB_COLUMN = {
	name: 'min-w-0 px-0 py-0',
	local: 'w-20 flex-none items-end px-0 py-0',
	server: 'w-24 flex-none items-end px-0 py-0',
	coverage: 'w-32 flex-none items-end px-0 py-0',
	size: 'w-20 flex-none items-end px-0 py-0',
	actions: 'w-ctl flex-none px-0 py-0',
} as const;

function CollectionRowView({
	row,
	label,
	sizeBytes,
	stuckCount = 0,
	backingOff,
	wide,
}: {
	row: CollectionRow;
	label: string;
	sizeBytes: number | null | undefined;
	stuckCount?: number;
	backingOff: boolean;
	wide: boolean;
}) {
	const t = useT();
	const runtime = useQueryRuntime();
	const { syncing, busy } = useManualSync();
	const { checking, check } = useCollectionCheck();
	const [confirming, setConfirming] = React.useState(false);
	const [phase, setPhase] = React.useState<RowPhase>('idle');
	const story = useRowStory(row, phase, backingOff);

	const isVariations = row.key === 'variations';
	const sizeText = formatBytes(sizeBytes ?? null);
	const clearBodyValues = {
		count: row.local.toLocaleString(),
		label: label.toLowerCase(),
		size: sizeText ? `≈ ${sizeText}` : '—',
	};

	const resetCollection = async () => {
		setConfirming(false);
		setPhase('clearing');
		try {
			// The dialog IS the queue-destroy confirmation, so force past it.
			await resetCollectionsAndRefill(runtime.engine, row.key, { confirmDestroyQueue: true });
			const successMessage =
				row.key === 'refunds'
					? t('health.database.redownload_done_refunds')
					: row.key === 'products'
						? t('health.database.redownload_done_products', {
								label,
							})
						: row.key === 'variations' || row.key === 'customers' || row.key === 'orders'
							? t('health.database.redownload_done_lazy', {
									label,
								})
							: t('health.database.redownload_done', {
									label,
								});
			Toast.show({
				type: 'success',
				text1: successMessage,
			});
		} catch (error) {
			Toast.show({
				type: 'error',
				text1: t('health.database.redownload_failed', {
					label,
				}),
				text2: t('health.database.redownload_failed_hint'),
			});
			// The one row for this failure; the raw message lives here, not in the toast.
			databaseLogger.error('Clear & re-download failed', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { collection: row.key, error: getErrorMessage(error) },
			});
		} finally {
			setPhase('idle');
		}
	};

	const menu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<IconButton
					name="ellipsisVertical"
					accessibilityLabel={t('common.more_actions')}
					testID={`db-row-menu-${row.key}`}
					disabled={phase === 'clearing' || busy}
					loading={syncing || checking === row.key}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem testID={`db-row-sync-now-${row.key}`} onPress={() => void check(row.key)}>
					<Icon name="arrowRotateRight" />
					<Text>{t('health.database.sync_now')}</Text>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					testID={`db-row-clear-${row.key}`}
					variant="destructive"
					onPress={() => setConfirming(true)}
				>
					<Icon name="trash" className="text-destructive" />
					<Text>{t('health.database.clear_redownload')}</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const clearingSub =
		phase === 'clearing' ? (
			<Text className="text-muted-foreground text-xs">
				{t('health.database.redownloading_count', {
					count: row.local.toLocaleString(),
				})}
			</Text>
		) : null;

	return (
		<>
			{/* wide — table row */}
			<TableRow testID={`db-row-${row.key}`} className={cn(DB_ROW, wide ? 'flex' : 'hidden')}>
				<TableCell className={cn(DB_COLUMN.name, isVariations && 'pl-4')}>
					<HStack className="items-center gap-2">
						<Text className={isVariations ? undefined : 'font-medium'}>
							{isVariations ? `↳ ${label}` : label}
						</Text>
						{stuckCount > 0 ? (
							<Badge variant="destructive" testID={`db-stuck-${row.key}`}>
								{t('health.database.n_stuck', { n: stuckCount })}
							</Badge>
						) : null}
					</HStack>
					{isVariations ? (
						<Text className="text-muted-foreground text-xs">
							{t('health.database.variations_policy')}
						</Text>
					) : null}
					{row.key === 'orders' || row.key === 'refunds' ? (
						<Text className="text-muted-foreground text-xs">
							{row.key === 'refunds'
								? t('health.database.refunds_policy', { days: HISTORY_DAYS })
								: t('health.database.orders_policy')}
						</Text>
					) : null}
					{clearingSub}
				</TableCell>
				<TableCell className={DB_COLUMN.local}>
					<Text className="text-right tabular-nums">{row.local.toLocaleString()}</Text>
				</TableCell>
				<TableCell className={DB_COLUMN.server}>
					<Text className="text-muted-foreground text-right text-sm tabular-nums">
						{story.serverText}
					</Text>
				</TableCell>
				<TableCell className={DB_COLUMN.coverage}>
					<CoverageCell coverage={story.coverage} />
				</TableCell>
				<TableCell className={DB_COLUMN.size}>
					<Text className="text-muted-foreground text-right text-sm tabular-nums">
						{sizeText ? `≈ ${sizeText}` : '—'}
					</Text>
				</TableCell>
				<TableCell className={DB_COLUMN.actions}>{menu}</TableCell>
			</TableRow>

			{/* compact — two-line list row */}
			<HStack
				testID={`db-row-sm-${row.key}`}
				className={cn('border-border items-center gap-2 border-b py-2', wide ? 'hidden' : 'flex')}
			>
				<View className="min-w-0 flex-1">
					<HStack className="items-center gap-2">
						<Text className={isVariations ? 'pl-4' : 'font-medium'}>
							{isVariations ? `↳ ${label}` : label}
						</Text>
						{stuckCount > 0 ? (
							<Badge variant="destructive" testID={`db-stuck-sm-${row.key}`}>
								{t('health.database.n_stuck', { n: stuckCount })}
							</Badge>
						) : null}
					</HStack>
					<Text
						className={`text-muted-foreground text-xs tabular-nums ${isVariations ? 'pl-4' : ''}`}
					>
						{phase === 'clearing'
							? t('health.database.redownloading_count', {
									count: row.local.toLocaleString(),
								})
							: isVariations
								? `${row.local.toLocaleString()} ${t('health.database.of_total', { total: story.serverText })} · ${t('health.database.with_products')}`
								: row.key === 'orders' || row.key === 'refunds'
									? `${row.local.toLocaleString()} ${t('health.database.of_total', { total: story.serverText })} · ${t('health.database.window_short')}`
									: story.coverage.kind === 'empty'
										? '0'
										: story.coverage.kind === 'complete'
											? t('health.database.all_n_local', {
													count: row.local.toLocaleString(),
												})
											: `${row.local.toLocaleString()} ${t('health.database.of_total', { total: story.serverText })}`}
						{story.coverage.kind === 'checking' ? ` · ${story.coverage.label}` : ''}
					</Text>
				</View>
				<View className="items-end">
					<Text className="text-muted-foreground text-sm tabular-nums">
						{sizeText ? `≈ ${sizeText}` : '—'}
					</Text>
					{story.coverage.kind === 'partial' || story.coverage.kind === 'windowed' ? (
						<CoverageBar percent={story.coverage.percent} className="mt-1 w-11" />
					) : null}
				</View>
				{menu}
			</HStack>

			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('health.database.clear_title', {
								label,
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{row.key === 'products'
								? t('health.database.clear_body_products', {
										...clearBodyValues,
									})
								: row.key === 'variations'
									? t('health.database.clear_body_variations', {
											...clearBodyValues,
										})
									: row.key === 'customers'
										? t('health.database.clear_body_customers', {
												...clearBodyValues,
											})
										: row.key === 'orders' || row.key === 'refunds'
											? row.key === 'refunds'
												? t('health.database.clear_body_refunds', { days: HISTORY_DAYS })
												: t('health.database.clear_body_orders')
											: t('health.database.clear_body', {
													...clearBodyValues,
												})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{t('common.cancel')}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							testID={`db-row-clear-confirm-${row.key}`}
							onPress={() => void resetCollection()}
						>
							<Text>{t('health.database.clear_confirm')}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/**
 * One muted storage line under the collection table. Renders nothing at zero
 * bytes — an empty bucket is noise, not information.
 */
function FootprintRow({
	label,
	sub,
	bytes,
	testID,
}: {
	label: string;
	sub?: string;
	bytes: number;
	testID: string;
}) {
	const text = formatBytes(bytes);
	if (bytes <= 0 || !text) return null;
	return (
		<TableRow testID={testID} className={DB_ROW}>
			<TableCell className={DB_COLUMN.name}>
				<Text className="text-muted-foreground">{label}</Text>
				{sub ? <Text className="text-muted-foreground/80 text-xs">{sub}</Text> : null}
			</TableCell>
			<TableCell className="flex-none items-end px-0 py-0">
				<Text className="text-muted-foreground text-right text-sm tabular-nums">{`≈ ${text}`}</Text>
			</TableCell>
			<TableCell className={DB_COLUMN.actions} />
		</TableRow>
	);
}

const HOW_SYNCING_WORKS_DOCS_URL = 'https://docs.wcpos.com/products/sync';

/** Explanatory content lives on the docs site, not in the app (owner ruling 2026-08-14). */
function HowSyncingWorksLink() {
	const t = useT();
	return (
		<DocsLink
			testID="db-how-syncing-works"
			href={HOW_SYNCING_WORKS_DOCS_URL}
			// Indented to sit in the freshness station's text column, under the status lines.
			className="mt-0.5 ml-3.5"
		>
			{t('health.database.how_title')}
		</DocsLink>
	);
}

/**
 * Store health · Database — "your store, on this device". Approved design:
 * health-database mockups v2 (2026-07-23, responsive + dual-rhythm freshness).
 * Every number traces to a real engine source (observability audit); % local
 * shows only against a fresh server census, never a local-count denominator.
 */
export function DatabaseScreen() {
	const t = useT();
	const tableLayout = useTableLayout();
	const { syncing, sync } = useManualSync();
	const { checking } = useCollectionCheck();
	const status = useEngineStatus();
	const counts = useCollectionCounts();
	const census = useCensusTotals();
	const mutations = useMutationCounts();
	const footprint = useStorageFootprint();
	const sizes = useCollectionSizes(counts, ROW_ORDER);
	const nowMs = useNowMs(1_000);
	const backingOff = isServerBackingOff(status.serverPressure, nowMs);
	const relative = useRelativeTime();

	const stats = useLogStats();
	// Durable, so it survives the restart that clears `stats` (#832 follow-up).
	const deadLetterStuck = useDeadLetterStuckRecords();
	// Durable for the same reason: the parked queue rows outlive the session log.
	const conflictedKeys = useUnresolvedConflictKeys();

	const rows = deriveRows(ROW_ORDER, counts, census);
	const totalRecords = totalLocalRecords(counts);
	const storageText = formatBytes(footprint?.totalBytes ?? null);
	const browserEstimateText = formatBytes(footprint?.browserEstimateBytes ?? null);
	const showBrowserEstimateNote =
		footprint?.browserEstimateBytes != null &&
		footprint.browserEstimateBytes - footprint.totalBytes >= 10 * 1024 * 1024 &&
		footprint.browserEstimateBytes >= footprint.totalBytes * 1.25;
	const stuck = mergeStuckRecords(deadLetterStuck, stats.stuck);
	const stuckByRow = stuckCountsByRow(stuck);
	// One attention zone, one framing per record: dead letters render in the
	// rejected panel (Send again / Discard) and parked conflicts in the
	// conflicted panel (Send again / Use server version), so the stuck banner
	// keeps only the session-log records neither panel lists — the same refused
	// sale must never appear as two differently-worded problems (Paul,
	// 2026-08-08; the anonymous "sale(s)" count violating this is why the
	// conflicted panel exists).
	const deadLetterKeys = new Set(deadLetterStuck.map((row) => row.key));
	const attentionStuck = stuck.filter(
		(row) => !deadLetterKeys.has(row.key) && !conflictedKeys.has(row.key)
	);
	const readyToSell = isReadyToSell({
		connectivity: status.connectivity,
		gatedBy: status.gatedBy,
		bootstrapFailed: Object.keys(status.bootstrapFailed).length > 0,
		productsLocal: counts.products ?? 0,
	});

	const changeLane = status.lanes['change-signal'];
	const lastCheck = changeLane?.lastTick ?? null;
	const censusWindow = censusFreshnessWindow(census);
	const censusProgress = censusWindowProgress(censusWindow, nowMs);

	return (
		<AreaPage
			title={t('common.database')}
			description={t('health.database.subtitle')}
			testID="screen-health-database"
		>
			<VStack className="gap-4">
				{/* Summary strip — shared Store health stat header */}
				<StatHeader testID="db-stats">
					<Stat
						value={readyToSell ? t('health.database.ready') : t('health.database.preparing')}
						tone={readyToSell ? 'good' : 'default'}
						label={t('health.database.ready_sub')}
						testID="db-stat-ready"
					/>
					<Stat
						value={totalRecords}
						label={t('health.database.records_on_device')}
						testID="db-stat-records"
					/>
					{storageText ? (
						<Stat
							value={storageText}
							label={t('health.database.storage_used')}
							testID="db-stat-storage"
						/>
					) : null}
					{/* Every queued outbound record counts the same here — a product edit
					    stuck on this device is as lost as a sale (Paul, 2026-08-08). */}
					<Stat
						value={mutations.syncBacklog}
						tone={mutations.syncBacklog > 0 ? 'bad' : 'good'}
						label={t('health.database.waiting_to_send')}
						testID="db-stat-waiting"
					/>
				</StatHeader>

				{/* THE attention zone — every record that needs a human lives here, each
				    with one framing. Dead letters render as the actionable rejected list
				    (durable, so it survives the restart that clears the log feed — #832);
				    the banner carries only session-log stuck records the list doesn't
				    show. Gating the list on the precomputed count keeps the common
				    (empty) case from mounting a Suspense boundary or querying the queue. */}
				<AttentionPanel stuck={attentionStuck} />
				{mutations.needsDecisionRejected > 0 ? (
					<React.Suspense fallback={<Loader size="sm" />}>
						<RejectedMutationsPanel />
					</React.Suspense>
				) : null}
				{/* Parked 409/428 conflicts — every row named and resolvable (Send
				    again / Use server version). Replaces the anonymous count callout
				    that called each one a "sale" and offered nothing (2026-08-14). */}
				{mutations.needsDecisionUnresolved > 0 ? (
					<React.Suspense fallback={<Loader size="sm" />}>
						<ConflictedMutationsPanel />
					</React.Suspense>
				) : null}

				{stats.clockSkew ? (
					<Callout tone="warning" testID="db-clock-skew">
						<Text className="text-warn-text text-sm">
							{`${
								stats.clockSkew.skewSeconds > 0
									? t('health.database.clock_skew_ahead', {
											amount: formatSkewMagnitude(stats.clockSkew.skewSeconds),
										})
									: t('health.database.clock_skew_behind', {
											amount: formatSkewMagnitude(stats.clockSkew.skewSeconds),
										})
							} ${t('health.database.clock_skew_hint')}`}
						</Text>
					</Callout>
				) : null}

				{status.connectivity === 'offline' ? (
					<Callout tone="warning">
						<Text className="text-warn-text text-sm">
							{readyToSell ? t('health.database.offline') : t('health.database.offline_preparing')}
						</Text>
					</Callout>
				) : null}

				{/* Per-collection rows (table header in the wide layout only; rows render both
				    layouts and show one, chosen by the measured table width) */}
				<Table testID="db-table" onLayout={tableLayout.onLayout}>
					<TableHeader className={tableLayout.wide ? 'flex' : 'hidden'}>
						<TableRow className="items-center gap-3">
							<TableHead className={DB_COLUMN.name}>
								<Text>{t('health.database.col_collection')}</Text>
							</TableHead>
							<TableHead className={DB_COLUMN.local}>
								<Text>{t('health.database.col_on_device')}</Text>
							</TableHead>
							<TableHead className={DB_COLUMN.server}>
								<Text>{t('health.database.col_on_server')}</Text>
							</TableHead>
							<TableHead className={DB_COLUMN.coverage}>
								<Text>{t('health.database.col_coverage')}</Text>
							</TableHead>
							<TableHead className={DB_COLUMN.size}>
								<Text>{t('health.database.col_size')}</Text>
							</TableHead>
							<TableHead className={DB_COLUMN.actions} />
						</TableRow>
					</TableHeader>
					{rows.map((row) => (
						<CollectionRowView
							key={row.key}
							row={row}
							sizeBytes={sizes[row.key]}
							stuckCount={stuckByRow[row.key] ?? 0}
							label={t(ROW_LABEL_KEYS[row.key])}
							wide={tableLayout.wide}
							backingOff={backingOff}
						/>
					))}
					{/* Measured storage the collection rows don't itemize — every bucket
					    is real bytes from the platform's storage layer. Aggregates only:
					    other stores show a count and a size, never names. */}
					{footprint ? (
						<>
							<FootprintRow
								testID="db-row-cached-images"
								label={t('health.database.storage_cached_images')}
								sub={t('health.database.storage_cached_images_sub')}
								bytes={footprint.cachedImagesBytes ?? 0}
							/>
							<FootprintRow
								testID="db-row-bookkeeping"
								label={t('health.database.storage_bookkeeping')}
								sub={t('health.database.storage_bookkeeping_sub')}
								bytes={footprint.breakdown.bookkeepingBytes}
							/>
							<FootprintRow
								testID="db-row-other-cashiers"
								label={t('health.database.storage_other_cashiers')}
								bytes={footprint.breakdown.otherCashiersBytes}
							/>
							<FootprintRow
								testID="db-row-other-stores"
								label={t('health.database.storage_other_stores', {
									n: footprint.breakdown.otherStoresCount,
								})}
								bytes={footprint.breakdown.otherStoresBytes}
							/>
							<FootprintRow
								testID="db-row-orphaned"
								label={t('health.database.storage_orphaned')}
								sub={t('health.database.storage_orphaned_sub')}
								bytes={footprint.breakdown.orphanedBytes}
							/>
							<FootprintRow
								testID="db-row-unattributed"
								label={t('health.database.storage_unattributed')}
								bytes={footprint.unattributedBytes}
							/>
							{showBrowserEstimateNote && browserEstimateText ? (
								<Text
									testID="db-note-browser-estimate"
									className="text-muted-foreground py-2 text-xs"
								>
									{t('health.database.storage_browser_estimate_note', {
										size: browserEstimateText,
									})}
								</Text>
							) : null}
						</>
					) : null}
				</Table>

				{/* Receipt emails that have not gone out yet (#165). Unlike the dead
				    letters above there is no cheap precomputed count to gate on, so the
				    panel mounts and renders nothing when the queue is empty — it reads a
				    local-only collection that holds at most a handful of rows. */}
				<React.Suspense fallback={<Loader size="sm" />}>
					<QueuedEmailsPanel />
				</React.Suspense>

				{/* Freshness station */}
				<HStack className="flex-wrap items-end justify-between gap-3 pt-1">
					<VStack className="gap-0.5">
						<HStack className="items-center gap-1.5">
							<View
								className={
									lastCheck?.status === 'error'
										? 'bg-warning h-2 w-2 rounded-full'
										: 'bg-success h-2 w-2 rounded-full'
								}
							/>
							<Text className="text-muted-foreground text-xs">
								{lastCheck === null
									? t('health.database.first_check_pending')
									: lastCheck.status === 'error'
										? t('health.database.last_check_error')
										: t('health.database.watching', {
												ago: relative(lastCheck.atMs, nowMs),
											})}
							</Text>
						</HStack>
						<Text className="text-muted-foreground pl-3.5 text-xs">
							{censusWindow.updatedAtMs === null
								? t('health.database.totals_pending')
								: backingOff
									? t('health.database.totals_server_busy', {
											ago: relative(censusWindow.updatedAtMs, nowMs),
										})
									: censusRefreshDue(censusWindow, nowMs)
										? t('health.database.totals_refreshing', {
												ago: relative(censusWindow.updatedAtMs, nowMs),
											})
										: t('health.database.totals_updated', {
												ago: relative(censusWindow.updatedAtMs, nowMs),
												next: relative(nowMs, censusWindow.nextUpdateAtMs ?? nowMs),
											})}
						</Text>
						{censusProgress !== null && !censusRefreshDue(censusWindow, nowMs) ? (
							<View className="bg-muted mt-1 ml-3.5 h-0.5 w-40 overflow-hidden rounded-full">
								<View
									className="bg-border h-0.5 rounded-full"
									style={{ width: `${Math.round(censusProgress * 100)}%` }}
								/>
							</View>
						) : null}
						<HowSyncingWorksLink />
					</VStack>
					{/* ml-auto keeps the action pinned to the table's right edge — under the
					    size column — even when the flex-wrap row breaks (owner request
					    2026-08-20); justify-between alone left-aligns a wrapped item. */}
					<Button
						testID="db-check-everything"
						variant="outline"
						size="sm"
						className="ml-auto"
						loading={syncing}
						disabled={checking !== null}
						onPress={() => void sync()}
					>
						<ButtonText>{t('health.database.check_everything')}</ButtonText>
					</Button>
				</HStack>

				<RegistersPanel />
			</VStack>
		</AreaPage>
	);
}
