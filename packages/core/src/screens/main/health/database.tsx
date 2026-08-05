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
	deriveEverythingElseBytes,
	deriveRows,
	formatBytes,
	isReadyToSell,
	stuckCountsByRow,
	totalLocalRecords,
} from './database-logic';
import { RejectedMutationsPanel } from './rejected-mutations';
import { useCollectionSizes } from './use-collection-sizes';
import { useOtherScopes } from './use-other-scopes';
import { useNowMs, useRelativeTime } from './use-relative-time';

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

function useStorageEstimate(): number | null {
	const [bytes, setBytes] = React.useState<number | null>(null);
	// Effect (last resort per project.mdc): navigator.storage.estimate() is a
	// one-shot async platform probe with no reactive/observable seam, so a
	// mount-time effect is the only way to pull it into React state.
	React.useEffect(() => {
		const nav = typeof navigator !== 'undefined' ? navigator : undefined;
		if (!nav?.storage?.estimate) return;
		let cancelled = false;
		void nav.storage
			.estimate()
			.then((estimate) => {
				if (!cancelled) setBytes(estimate.usage ?? null);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);
	return bytes;
}

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
 * - variations have no server census (they download with their products)
 * - orders show the real server total plus the windowing policy
 * - a stale/missing census reads "checking…", never "unknown"
 * - an empty fresh census reads "none on your server"
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
	if (row.key === 'variations') {
		return {
			serverText: t('health.database.with_products'),
			coverage: { kind: 'none', label: '—' },
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
			coverage: {
				kind: 'empty',
				label: t('health.database.none_on_server'),
			},
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
				tooltip: t('health.database.window_tooltip', {
					p: percent,
				}),
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
					disabled={phase === 'clearing'}
				>
					<Icon name="ellipsisVertical" className="text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuItem onPress={() => void engine.sync()}>
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
								? `${row.local.toLocaleString()} · ${t('health.database.with_products')}`
								: row.key === 'orders'
									? `${row.local.toLocaleString()} ${t('health.database.of_total', { total: story.serverText })} · ${t('health.database.window_short')}`
									: story.coverage.kind === 'empty'
										? t('health.database.none_on_server')
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
	const { engine } = useQueryRuntime();
	const status = useEngineStatus();
	const counts = useCollectionCounts();
	const census = useCensusTotals();
	const mutations = useMutationCounts();
	const storageBytes = useStorageEstimate();
	const sizes = useCollectionSizes(counts, ROW_ORDER);
	const nowMs = useNowMs(1_000);
	const relative = useRelativeTime();

	const stats = useLogStats();
	const otherScopes = useOtherScopes();

	const rows = deriveRows(ROW_ORDER, counts, census);
	const totalRecords = totalLocalRecords(counts);
	const storageText = formatBytes(storageBytes);
	const stuckByRow = stuckCountsByRow(stats.stuck);
	const everythingElseText = formatBytes(
		deriveEverythingElseBytes(
			storageBytes,
			ROW_ORDER.map((key) => sizes[key]),
			// Everything NOT belonging to the active scope leaves the reconciliation:
			// other stores AND this store's other cashiers — otherwise inactive
			// cashiers' scopes masquerade as this scope's indexes/logs.
			otherScopes ? otherScopes.bytes + otherScopes.sameStoreOtherCashierBytes : null
		)
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
		<ScrollView className="flex-1">
			<VStack testID="screen-health-database" className="max-w-3xl gap-3 p-4 md:p-6">
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
					<Stat
						value={mutations.pendingOrders}
						tone={mutations.pendingOrders > 0 ? 'bad' : 'good'}
						label={t('health.database.waiting_to_send')}
						testID="db-stat-waiting"
					/>
				</StatHeader>

				<AttentionPanel stuck={stats.stuck} />

				{stats.clockSkew ? (
					<Callout tone="warning" testID="db-clock-skew">
						<Text className="text-warning text-sm">
							{`${
								stats.clockSkew.skewSeconds > 0
									? t('health.database.clock_skew_ahead', {
											defaultValue: "Your server's clock is about {amount} ahead of this device.",
											amount: formatSkewMagnitude(stats.clockSkew.skewSeconds),
										})
									: t('health.database.clock_skew_behind', {
											defaultValue: "Your server's clock is about {amount} behind this device.",
											amount: formatSkewMagnitude(stats.clockSkew.skewSeconds),
										})
							} ${t('health.database.clock_skew_hint', {
								defaultValue:
									"Check the server's date, time and timezone settings — order times, receipts and reports may be wrong until the clocks agree.",
							})}`}
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
					{everythingElseText ? (
						<HStack
							testID="db-row-everything-else"
							className="border-border items-center gap-3 border-b py-2"
						>
							<View className="min-w-0 flex-1">
								<Text className="text-muted-foreground">
									{t('health.database.everything_else')}
								</Text>
								<Text className="text-muted-foreground/80 text-xs">
									{t('health.database.everything_else_sub')}
								</Text>
							</View>
							<Text className="text-muted-foreground text-right text-sm tabular-nums">
								{`≈ ${everythingElseText}`}
							</Text>
							<View className="w-9" />
						</HStack>
					) : null}
				</VStack>

				{/* Conflicts — 409s only. Dead letters are a different failure with a
				    different fix, and they get their own actionable list below (#832). */}
				{mutations.conflicts - mutations.rejected > 0 ? (
					<Callout tone="destructive">
						<Text className="text-destructive text-sm">
							{t('health.database.conflicts', {
								n: mutations.conflicts - mutations.rejected,
							})}
						</Text>
					</Callout>
				) : null}

				{/* Dead letters — writes the server permanently refused (#832). Rendered
				    only when the count says there are some, so the common (empty) case
				    never mounts a Suspense boundary or queries the queue at all. */}
				{mutations.rejected > 0 ? (
					<React.Suspense fallback={<Loader size="sm" />}>
						<RejectedMutationsPanel />
					</React.Suspense>
				) : null}

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
						<Button variant="outline" size="sm" onPress={() => void engine.sync()}>
							<ButtonText>{t('health.database.check_everything')}</ButtonText>
						</Button>
					</HStack>
				</HStack>

				<View className="h-4" />
			</VStack>
		</ScrollView>
	);
}
