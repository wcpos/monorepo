import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

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
import { Button, ButtonText } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Loader } from '@wcpos/components/loader';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { VStack } from '@wcpos/components/vstack';
import { COLLECTION_VOCABULARY, runResetRefill, useQueryRuntime } from '@wcpos/query';

import { AttentionPanel } from './attention-panel';
import { useManualSync } from './use-manual-sync';
import { mergeStuckRecords, useDeadLetterStuckRecords } from './use-dead-letter-attention';
import { useT } from '../../../contexts/translations';
import { formatSkewMagnitude } from '../logs/logs-logic';
import { useLogStats } from '../logs/use-log-stats';
import { useCensusTotals } from '../hooks/use-census-totals';
import {
	useCollectionCounts,
	useEngineStatus,
	useMutationCounts,
} from '../hooks/use-engine-monitor';
import {
	Callout,
	CoverageBar,
	HairlineHeaderCell,
	HairlineHeaderRow,
	Pill,
	Stat,
	StatHeader,
} from './components';
import {
	censusFreshnessWindow,
	censusRefreshDue,
	censusWindowProgress,
	type CollectionKey,
	type CollectionRow,
	deriveRows,
	formatBytes,
	isReadyToSell,
	stuckCountsByRow,
	totalLocalRecords,
} from './database-logic';
import { QueuedEmailsPanel } from './queued-emails';
import { RejectedMutationsPanel } from './rejected-mutations';
import { useCollectionSizes } from './use-collection-sizes';
import { useNowMs, useRelativeTime } from './use-relative-time';
import { useStorageFootprint } from './use-storage-footprint';

function exhaustiveCollectionOrder<const Order extends readonly CollectionKey[]>(
	order: Exclude<CollectionKey, Order[number]> extends never ? Order : never
): Order {
	return order;
}

const ROW_ORDER = exhaustiveCollectionOrder([
	'products',
	'variations',
	'orders',
	'customers',
	'categories',
	'brands',
	'tags',
	'coupons',
	'taxRates',
]);

/** Engine row key → the legacy collection key the reset funnel speaks. */
const ROW_TO_LEGACY = Object.fromEntries(
	Object.entries(COLLECTION_VOCABULARY).map(([name, row]) => [name, row.legacyName])
) as Record<CollectionKey, string>;

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
function useRowStory(row: CollectionRow, phase: RowPhase): RowStory {
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
		return {
			serverText: '…',
			coverage: {
				kind: 'checking',
				label: t('health.database.checking'),
			},
		};
	}
	if (row.serverTotal === 0 && row.local === 0) {
		return {
			serverText: '0',
			coverage: { kind: 'empty', label: '—' },
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

function CollectionRowView({
	row,
	label,
	sizeBytes,
	stuckCount = 0,
}: {
	row: CollectionRow;
	label: string;
	sizeBytes: number | null | undefined;
	stuckCount?: number;
}) {
	const t = useT();
	const { engine } = useQueryRuntime();
	const { syncing, sync } = useManualSync();
	const [confirming, setConfirming] = React.useState(false);
	const [phase, setPhase] = React.useState<RowPhase>('idle');
	const story = useRowStory(row, phase);

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
			// Clearing products must also clear the separate variations collection, or
			// stale child docs survive — the same pairing the app-wide reset funnel uses.
			const engineNames: CollectionKey[] =
				row.key === 'products' ? ['variations', 'products'] : [row.key];
			const legacyNames = engineNames.map((name) => ROW_TO_LEGACY[name]);
			// Reseed + drain the dropped collections immediately (the merchant expects
			// a re-download, not just a delete) — the established refill path.
			for (const name of engineNames) {
				// The dialog IS the queue-destroy confirmation, so force past it.
				await engine.scope.resetCollection(name, { confirmDestroyQueue: true });
			}
			await runResetRefill(engine, legacyNames);
			const successMessage =
				row.key === 'products'
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
				text2: error instanceof Error ? error.message : String(error),
			});
		} finally {
			setPhase('idle');
		}
	};

	const menu = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					testID={`db-row-menu-${row.key}`}
					disabled={phase === 'clearing' || syncing}
					loading={syncing}
				>
					<Icon name="ellipsisVertical" className="text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuItem testID={`db-row-sync-now-${row.key}`} onPress={() => void sync()}>
					<Text>{t('health.database.sync_now')}</Text>
				</DropdownMenuItem>
				<DropdownMenuItem onPress={() => setConfirming(true)}>
					<Text className="text-destructive">{t('health.database.clear_redownload')}</Text>
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
			{/* md+ — table row */}
			<HStack
				testID={`db-row-${row.key}`}
				className="border-border hidden items-center gap-3 border-b py-2 md:flex"
			>
				<View className={isVariations ? 'flex-1 pl-4' : 'flex-1'}>
					<HStack className="items-center gap-2">
						<Text className={isVariations ? undefined : 'font-medium'}>
							{isVariations ? `↳ ${label}` : label}
						</Text>
						{stuckCount > 0 ? (
							<Pill testID={`db-stuck-${row.key}`}>
								{t('health.database.n_stuck', { n: stuckCount })}
							</Pill>
						) : null}
					</HStack>
					{isVariations ? (
						<Text className="text-muted-foreground text-xs">
							{t('health.database.variations_policy')}
						</Text>
					) : null}
					{row.key === 'orders' ? (
						<Text className="text-muted-foreground text-xs">
							{t('health.database.orders_policy')}
						</Text>
					) : null}
					{clearingSub}
				</View>
				<Text className="w-20 text-right tabular-nums">{row.local.toLocaleString()}</Text>
				<Text className="text-muted-foreground w-24 text-right text-sm tabular-nums">
					{story.serverText}
				</Text>
				<View className="w-32 items-end">
					<CoverageCell coverage={story.coverage} />
				</View>
				<Text className="text-muted-foreground w-20 text-right text-sm tabular-nums">
					{sizeText ? `≈ ${sizeText}` : '—'}
				</Text>
				{menu}
			</HStack>

			{/* below md — two-line list row */}
			<HStack
				testID={`db-row-sm-${row.key}`}
				className="border-border items-center gap-2 border-b py-2 md:hidden"
			>
				<View className="min-w-0 flex-1">
					<HStack className="items-center gap-2">
						<Text className={isVariations ? 'pl-4' : 'font-medium'}>
							{isVariations ? `↳ ${label}` : label}
						</Text>
						{stuckCount > 0 ? (
							<Pill testID={`db-stuck-sm-${row.key}`}>
								{t('health.database.n_stuck', { n: stuckCount })}
							</Pill>
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
								: row.key === 'orders'
									? `${row.local.toLocaleString()} ${t('health.database.of_total', { total: story.serverText })} · ${t('health.database.window_short')}`
									: story.coverage.kind === 'empty'
										? '0'
										: story.coverage.kind === 'complete'
											? t('health.database.all_n_local', {
													count: row.local.toLocaleString(),
												})
											: `${row.local.toLocaleString()} ${t('health.database.of_total', { total: story.serverText })}`}
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
										: row.key === 'orders'
											? t('health.database.clear_body_orders')
											: t('health.database.clear_body', {
													...clearBodyValues,
												})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{t('common.cancel')}</Text>
						</AlertDialogCancel>
						<AlertDialogAction onPress={() => void resetCollection()}>
							<Text className="text-destructive">{t('health.database.clear_confirm')}</Text>
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
		<HStack testID={testID} className="border-border items-center gap-3 border-b py-2">
			<View className="min-w-0 flex-1">
				<Text className="text-muted-foreground">{label}</Text>
				{sub ? <Text className="text-muted-foreground/80 text-xs">{sub}</Text> : null}
			</View>
			<Text className="text-muted-foreground text-right text-sm tabular-nums">{`≈ ${text}`}</Text>
			<View className="w-9" />
		</HStack>
	);
}

/** The accurate "how syncing works" schedule, straight from the engine's lanes. */
function HowSyncingWorksDialog() {
	const t = useT();
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" testID="db-how-syncing-works">
					<HStack className="items-center gap-1">
						<Icon name="circleInfo" size="sm" className="text-muted-foreground" />
						<Text className="text-muted-foreground text-xs">{t('health.database.how_title')}</Text>
					</HStack>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{t('health.database.how_title')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<VStack className="gap-3">
						<Text className="text-sm">{t('health.database.how_changes')}</Text>
						<Text className="text-sm">{t('health.database.how_orders')}</Text>
						<Text className="text-sm">{t('health.database.how_audits')}</Text>
						<Text className="text-sm">{t('health.database.how_totals')}</Text>
					</VStack>
				</DialogBody>
			</DialogContent>
		</Dialog>
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
	const { syncing, sync } = useManualSync();
	const status = useEngineStatus();
	const counts = useCollectionCounts();
	const census = useCensusTotals();
	const mutations = useMutationCounts();
	const footprint = useStorageFootprint();
	const sizes = useCollectionSizes(counts, ROW_ORDER);
	const nowMs = useNowMs(1_000);
	const relative = useRelativeTime();

	const stats = useLogStats();
	// Durable, so it survives the restart that clears `stats` (#832 follow-up).
	const deadLetterStuck = useDeadLetterStuckRecords();

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
	// rejected panel (Send again / Discard), so the stuck banner keeps only the
	// session-log records the panel does NOT list — the same refused sale must
	// never appear as two differently-worded problems (Paul, 2026-08-08).
	const deadLetterKeys = new Set(deadLetterStuck.map((row) => row.key));
	const attentionStuck = stuck.filter((row) => !deadLetterKeys.has(row.key));
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
		<ScrollView className="flex-1">
			<VStack
				testID="screen-health-database"
				className="mx-auto w-full max-w-4xl gap-4 px-4 py-6 md:px-10 md:py-8"
			>
				<Text className="text-muted-foreground text-sm">{t('health.database.subtitle')}</Text>

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
						value={mutations.pending}
						tone={mutations.pending > 0 ? 'bad' : 'good'}
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
				{mutations.rejected > 0 ? (
					<React.Suspense fallback={<Loader size="sm" />}>
						<RejectedMutationsPanel />
					</React.Suspense>
				) : null}

				{stats.clockSkew ? (
					<Callout tone="warning" testID="db-clock-skew">
						<Text className="text-warning text-sm">
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
						<Text className="text-warning text-sm">
							{readyToSell ? t('health.database.offline') : t('health.database.offline_preparing')}
						</Text>
					</Callout>
				) : null}

				{/* Per-collection rows (table header md+ only; rows render both layouts) */}
				<VStack className="gap-0">
					<HairlineHeaderRow className="hidden md:flex">
						<HairlineHeaderCell className="flex-1">
							{t('health.database.col_collection')}
						</HairlineHeaderCell>
						<HairlineHeaderCell className="w-20 text-right">
							{t('health.database.col_on_device')}
						</HairlineHeaderCell>
						<HairlineHeaderCell className="w-24 text-right">
							{t('health.database.col_on_server')}
						</HairlineHeaderCell>
						<HairlineHeaderCell className="w-32 text-right">
							{t('health.database.col_coverage')}
						</HairlineHeaderCell>
						<HairlineHeaderCell className="w-20 text-right">
							{t('health.database.col_size')}
						</HairlineHeaderCell>
						<View className="w-9" />
					</HairlineHeaderRow>
					{rows.map((row) => (
						<CollectionRowView
							key={row.key}
							row={row}
							sizeBytes={sizes[row.key]}
							stuckCount={stuckByRow[row.key] ?? 0}
							label={t(ROW_LABEL_KEYS[row.key])}
						/>
					))}
					{/* Measured storage the collection rows don't itemize — every bucket
					    is real bytes from the platform's storage layer, split so search
					    indexes never masquerade as store data. Aggregates only: other
					    stores show a count and a size, never names. */}
					{footprint ? (
						<>
							<FootprintRow
								testID="db-row-search-indexes"
								label={t('health.database.storage_search_indexes')}
								sub={t('health.database.storage_search_indexes_sub')}
								bytes={footprint.breakdown.searchIndexBytes}
							/>
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
				</VStack>

				{/* Conflicts — 409s only. Dead letters are a different failure with a
				    different fix, and they get their own actionable list below (#832). */}
				{mutations.unresolvedConflicts > 0 ? (
					<Callout tone="destructive">
						<Text className="text-destructive text-sm">
							{t('health.database.conflicts', {
								n: mutations.unresolvedConflicts,
							})}
						</Text>
					</Callout>
				) : null}

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
					</VStack>
					<HStack className="items-center gap-2">
						<HowSyncingWorksDialog />
						<Button
							testID="db-check-everything"
							variant="outline"
							size="sm"
							loading={syncing}
							onPress={() => void sync()}
						>
							<ButtonText>{t('health.database.check_everything')}</ButtonText>
						</Button>
					</HStack>
				</HStack>

				<View className="h-4" />
			</VStack>
		</ScrollView>
	);
}
