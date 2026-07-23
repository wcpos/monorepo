import * as React from 'react';
import { ScrollView, View } from 'react-native';

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
import { VStack } from '@wcpos/components/vstack';
import { prepareCollectionResetRefill, useQueryManager } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { useCensusTotals } from '../hooks/use-census-totals';
import {
	useCollectionCounts,
	useEngineStatus,
	useMutationCounts,
} from '../hooks/use-engine-monitor';
import {
	censusFreshnessWindow,
	censusRefreshDue,
	censusWindowProgress,
	type CollectionKey,
	type CollectionRow,
	deriveRows,
	formatBytes,
	isReadyToSell,
	relativeTimeParts,
	totalLocalRecords,
} from './database-logic';
import { useCollectionSizes } from './use-collection-sizes';

const ROW_ORDER: CollectionKey[] = [
	'products',
	'variations',
	'orders',
	'customers',
	'categories',
	'brands',
	'tags',
	'coupons',
	'taxRates',
];

/** Engine row key → the legacy collection key the reset funnel speaks. */
const ROW_TO_LEGACY: Record<CollectionKey, string> = {
	products: 'products',
	variations: 'variations',
	orders: 'orders',
	customers: 'customers',
	categories: 'products/categories',
	brands: 'products/brands',
	tags: 'products/tags',
	coupons: 'coupons',
	taxRates: 'taxes',
};

const ROW_LABEL_KEYS: Record<CollectionKey, { key: string; fallback: string }> = {
	products: { key: 'common.products', fallback: 'Products' },
	variations: { key: 'common.variations', fallback: 'Variations' },
	orders: { key: 'common.orders', fallback: 'Orders' },
	customers: { key: 'common.customers', fallback: 'Customers' },
	categories: { key: 'common.categories', fallback: 'Categories' },
	brands: { key: 'common.brands', fallback: 'Brands' },
	tags: { key: 'common.tags', fallback: 'Tags' },
	coupons: { key: 'common.coupons', fallback: 'Coupons' },
	taxRates: { key: 'common.tax_rates', fallback: 'Tax rates' },
};

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

/** A ticking "now" so relative freshness copy stays current while the page is open. */
function useNowMs(intervalMs: number): number {
	const [nowMs, setNowMs] = React.useState(() => Date.now());
	// Effect (last resort per project.mdc): wall-clock time has no reactive seam.
	React.useEffect(() => {
		const timer = setInterval(() => setNowMs(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return nowMs;
}

function useRelativeTime(): (fromMs: number, toMs: number) => string {
	const t = useT();
	return React.useCallback(
		(fromMs: number, toMs: number) => {
			const { unit, value } = relativeTimeParts(fromMs, toMs);
			if (unit === 'seconds') {
				return value < 5
					? t('health.database.just_now', { defaultValue: 'just now' })
					: t('health.database.n_seconds', { defaultValue: '{n} seconds', n: value });
			}
			if (unit === 'minutes') {
				return t('health.database.n_minutes', { defaultValue: '{n} min', n: value });
			}
			return t('health.database.n_hours', { defaultValue: '{n} h', n: value });
		},
		[t]
	);
}

function PercentBar({ percent, className }: { percent: number; className?: string }) {
	return (
		<View className={`bg-muted h-1 w-16 overflow-hidden rounded-full ${className ?? ''}`}>
			<View
				className={percent >= 100 ? 'bg-success h-1 rounded-full' : 'bg-primary h-1 rounded-full'}
				style={{ width: `${percent}%` }}
			/>
		</View>
	);
}

type RowPhase = 'idle' | 'clearing';

type RowCoverage =
	| { kind: 'clearing'; label: string }
	| { kind: 'partial'; label: string; percent: number }
	| { kind: 'complete' | 'windowed' | 'checking' | 'empty' | 'none'; label: string };

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
				label: t('health.database.redownloading', { defaultValue: 'Re-downloading…' }),
			},
		};
	}
	if (row.key === 'variations') {
		return {
			serverText: t('health.database.with_products', { defaultValue: 'with products' }),
			coverage: { kind: 'none', label: '—' },
		};
	}
	if (!row.fresh || row.serverTotal === null) {
		return {
			serverText: '…',
			coverage: {
				kind: 'checking',
				label: t('health.database.checking', { defaultValue: 'checking…' }),
			},
		};
	}
	if (row.serverTotal === 0 && row.local === 0) {
		return {
			serverText: '0',
			coverage: {
				kind: 'empty',
				label: t('health.database.none_on_server', { defaultValue: 'none on your server' }),
			},
		};
	}
	if (row.windowed) {
		return {
			serverText: row.serverTotal.toLocaleString(),
			coverage: {
				kind: 'windowed',
				label: t('health.database.window_ready', { defaultValue: 'open + recent ready' }),
			},
		};
	}
	if (row.percentLocal !== null && row.percentLocal >= 100) {
		return {
			serverText: row.serverTotal.toLocaleString(),
			coverage: {
				kind: 'complete',
				label: t('health.database.all_local', { defaultValue: '✓ all' }),
			},
		};
	}
	return {
		serverText: row.serverTotal.toLocaleString(),
		coverage: {
			kind: 'partial',
			label: `${row.percentLocal ?? 0}%`,
			percent: row.percentLocal ?? 0,
		},
	};
}

function CoverageCell({ coverage }: { coverage: RowCoverage }) {
	switch (coverage.kind) {
		case 'clearing':
			return (
				<HStack className="items-center justify-end gap-2">
					<Loader size="sm" />
					<Text className="text-muted-foreground text-xs">{coverage.label}</Text>
				</HStack>
			);
		case 'partial':
			return (
				<HStack className="items-center justify-end gap-2">
					<Text className="text-muted-foreground text-xs tabular-nums">{coverage.label}</Text>
					<PercentBar percent={coverage.percent} />
				</HStack>
			);
		case 'complete':
		case 'windowed':
			return <Text className="text-success text-right text-xs">{coverage.label}</Text>;
		default:
			return <Text className="text-muted-foreground text-right text-xs">{coverage.label}</Text>;
	}
}

function CollectionRowView({
	row,
	label,
	sizeBytes,
}: {
	row: CollectionRow;
	label: string;
	sizeBytes: number | null | undefined;
}) {
	const t = useT();
	const { engine } = useQueryManager();
	const [confirming, setConfirming] = React.useState(false);
	const [phase, setPhase] = React.useState<RowPhase>('idle');
	const story = useRowStory(row, phase);

	const isVariations = row.key === 'variations';
	const sizeText = formatBytes(sizeBytes ?? null);

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
			const refill = prepareCollectionResetRefill(engine, legacyNames);
			for (const name of engineNames) {
				// The dialog IS the queue-destroy confirmation, so force past it.
				await engine.scope.resetCollection(name, { confirmDestroyQueue: true });
			}
			await refill();
			Toast.show({
				type: 'success',
				text1: t('health.database.redownload_done', {
					defaultValue: '{label} re-downloaded fresh from your server',
					label,
				}),
			});
		} catch (error) {
			Toast.show({
				type: 'error',
				text1: t('health.database.redownload_failed', {
					defaultValue: "Couldn't finish re-downloading {label}",
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
					<Text>{t('health.database.sync_now', { defaultValue: 'Check for changes now' })}</Text>
				</DropdownMenuItem>
				<DropdownMenuItem onPress={() => setConfirming(true)}>
					<Text className="text-destructive">
						{t('health.database.clear_redownload', { defaultValue: 'Clear & re-download…' })}
					</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const clearingSub =
		phase === 'clearing' ? (
			<Text className="text-muted-foreground text-xs">
				{t('health.database.redownloading_count', {
					defaultValue: 'Re-downloading — {count} so far',
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
					<Text className={isVariations ? undefined : 'font-medium'}>
						{isVariations ? `↳ ${label}` : label}
					</Text>
					{isVariations ? (
						<Text className="text-muted-foreground text-xs">
							{t('health.database.variations_policy', {
								defaultValue: 'download with their products',
							})}
						</Text>
					) : null}
					{row.key === 'orders' ? (
						<Text className="text-muted-foreground text-xs">
							{t('health.database.orders_policy', {
								defaultValue: 'open + recent stay on device · older download when viewed',
							})}
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
					<Text className={isVariations ? 'pl-4' : 'font-medium'}>
						{isVariations ? `↳ ${label}` : label}
					</Text>
					<Text
						className={`text-muted-foreground text-xs tabular-nums ${isVariations ? 'pl-4' : ''}`}
					>
						{phase === 'clearing'
							? t('health.database.redownloading_count', {
									defaultValue: 'Re-downloading — {count} so far',
									count: row.local.toLocaleString(),
								})
							: isVariations
								? `${row.local.toLocaleString()} · ${t('health.database.with_products', { defaultValue: 'with products' })}`
								: row.key === 'orders'
									? `${row.local.toLocaleString()} ${t('health.database.of_total', { defaultValue: 'of {total}', total: story.serverText })} · ${t('health.database.window_short', { defaultValue: 'open + recent' })}`
									: story.coverage.kind === 'empty'
										? t('health.database.none_on_server', {
												defaultValue: 'none on your server',
											})
										: story.coverage.kind === 'complete'
											? t('health.database.all_n_local', {
													defaultValue: 'all {count} on device',
													count: row.local.toLocaleString(),
												})
											: `${row.local.toLocaleString()} ${t('health.database.of_total', { defaultValue: 'of {total}', total: story.serverText })}`}
					</Text>
				</View>
				<View className="items-end">
					<Text className="text-muted-foreground text-sm tabular-nums">
						{sizeText ? `≈ ${sizeText}` : '—'}
					</Text>
					{story.coverage.kind === 'partial' ? (
						<PercentBar percent={story.coverage.percent} className="mt-1 w-11" />
					) : null}
				</View>
				{menu}
			</HStack>

			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('health.database.clear_title', {
								defaultValue: 'Clear {label} from this device?',
								label,
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{row.windowed
								? t('health.database.clear_body_orders', {
										defaultValue:
											'The orders held on this device will be removed and re-downloaded fresh from your server. Nothing on the server changes. You can keep selling — recent orders reappear within a moment.',
									})
								: t('health.database.clear_body', {
										defaultValue:
											'{count} {label} ({size}) will be removed and re-downloaded fresh from your server. Sales and orders are not affected. You can keep selling — search may be incomplete for a minute.',
										count: row.local.toLocaleString(),
										label: label.toLowerCase(),
										size: sizeText ? `≈ ${sizeText}` : '—',
									})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{t('common.cancel', { defaultValue: 'Cancel' })}</Text>
						</AlertDialogCancel>
						<AlertDialogAction onPress={() => void resetCollection()}>
							<Text className="text-destructive">
								{t('health.database.clear_confirm', { defaultValue: 'Clear & re-download' })}
							</Text>
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
						<Text className="text-muted-foreground text-xs">
							{t('health.database.how_title', { defaultValue: 'How syncing works' })}
						</Text>
					</HStack>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{t('health.database.how_title', { defaultValue: 'How syncing works' })}
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<VStack className="gap-3">
						<Text className="text-sm">
							{t('health.database.how_changes', {
								defaultValue:
									'Every 10 seconds this till asks your server one lightweight question: "what changed?" — one request covering products, variations, customers, categories, brands, tags, coupons and tax rates. Only changed records are downloaded, so the check stays fast no matter how big your catalog is.',
							})}
						</Text>
						<Text className="text-sm">
							{t('health.database.how_orders', {
								defaultValue:
									'Orders work differently: open and recent orders refresh every 5 minutes, and older orders download when you view them. Sales made on this till are sent to your server within seconds.',
							})}
						</Text>
						<Text className="text-sm">
							{t('health.database.how_audits', {
								defaultValue:
									'Deeper safety nets run in the background: an integrity sweep every few minutes catches edits that slip past the normal signals, and a deletion audit about every 17 minutes removes records deleted on the server.',
							})}
						</Text>
						<Text className="text-sm">
							{t('health.database.how_totals', {
								defaultValue:
									'The server totals on this page refresh every 15 minutes — they are a snapshot for comparison, not the live sync itself.',
							})}
						</Text>
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
	const { engine } = useQueryManager();
	const status = useEngineStatus();
	const counts = useCollectionCounts();
	const census = useCensusTotals();
	const mutations = useMutationCounts();
	const storageBytes = useStorageEstimate();
	const sizes = useCollectionSizes(counts, ROW_ORDER);
	const nowMs = useNowMs(1_000);
	const relative = useRelativeTime();

	const rows = deriveRows(ROW_ORDER, counts, census);
	const totalRecords = totalLocalRecords(counts);
	const storageText = formatBytes(storageBytes);
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
				<Text className="text-muted-foreground text-sm">
					{t(
						'health.database.subtitle',
						'Your store, on this device — sales keep working even if your server does not.'
					)}
				</Text>

				{/* Summary strip */}
				<HStack className="border-border flex-wrap gap-x-6 gap-y-3 border-b pb-3">
					<VStack className="min-w-[40%] gap-0 md:min-w-0">
						<Text
							className={readyToSell ? 'text-success font-semibold' : 'text-warning font-semibold'}
						>
							{readyToSell
								? t('health.database.ready', { defaultValue: '✓ Ready to sell' })
								: t('health.database.preparing', { defaultValue: 'Preparing…' })}
						</Text>
						<Text className="text-muted-foreground text-xs">
							{t('health.database.ready_sub', { defaultValue: 'catalog & open orders local' })}
						</Text>
					</VStack>
					<VStack className="min-w-[40%] gap-0 md:min-w-0">
						<Text className="font-semibold tabular-nums">{totalRecords.toLocaleString()}</Text>
						<Text className="text-muted-foreground text-xs">
							{t('health.database.records_on_device', { defaultValue: 'records on this device' })}
						</Text>
					</VStack>
					{storageText ? (
						<VStack className="min-w-[40%] gap-0 md:min-w-0">
							<Text className="font-semibold tabular-nums">{storageText}</Text>
							<Text className="text-muted-foreground text-xs">
								{t('health.database.storage_used', { defaultValue: 'storage used' })}
							</Text>
						</VStack>
					) : null}
					<VStack className="min-w-[40%] gap-0 md:min-w-0">
						<Text
							className={
								mutations.pending > 0 ? 'text-warning font-semibold' : 'text-success font-semibold'
							}
						>
							{mutations.pending}
						</Text>
						<Text className="text-muted-foreground text-xs">
							{t('health.database.waiting_to_send', { defaultValue: 'sales waiting to send' })}
						</Text>
					</VStack>
				</HStack>

				{status.connectivity === 'offline' ? (
					<View className="border-warning/40 bg-warning/10 rounded-md border p-2">
						<Text className="text-warning text-sm">
							{readyToSell
								? t('health.database.offline', {
										defaultValue:
											"You're offline. Sales keep working — anything you make is stored here and delivered when your server is back.",
									})
								: t('health.database.offline_preparing', {
										defaultValue:
											"You're offline and still setting up — this till can't sell until its catalog finishes downloading.",
									})}
						</Text>
					</View>
				) : null}

				{/* Per-collection rows (table header md+ only; rows render both layouts) */}
				<VStack className="gap-0">
					<HStack className="border-border hidden items-center gap-3 border-b pb-1 md:flex">
						<Text className="text-muted-foreground flex-1 text-xs uppercase">
							{t('health.database.col_collection', { defaultValue: 'Collection' })}
						</Text>
						<Text className="text-muted-foreground w-20 text-right text-xs uppercase">
							{t('health.database.col_on_device', { defaultValue: 'On device' })}
						</Text>
						<Text className="text-muted-foreground w-24 text-right text-xs uppercase">
							{t('health.database.col_on_server', { defaultValue: 'On server' })}
						</Text>
						<Text className="text-muted-foreground w-32 text-right text-xs uppercase">
							{t('health.database.col_coverage', { defaultValue: 'Coverage' })}
						</Text>
						<Text className="text-muted-foreground w-20 text-right text-xs uppercase">
							{t('health.database.col_size', { defaultValue: 'Size' })}
						</Text>
						<View className="w-9" />
					</HStack>
					{rows.map((row) => (
						<CollectionRowView
							key={row.key}
							row={row}
							sizeBytes={sizes[row.key]}
							label={t(ROW_LABEL_KEYS[row.key].key, {
								defaultValue: ROW_LABEL_KEYS[row.key].fallback,
							})}
						/>
					))}
				</VStack>

				{/* Conflicts */}
				{mutations.conflicts > 0 ? (
					<View className="border-destructive/40 bg-destructive/10 rounded-md border p-2">
						<Text className="text-destructive text-sm">
							{t('health.database.conflicts', {
								defaultValue:
									'{n} sale(s) need attention — changed on the server while a till was editing.',
								n: mutations.conflicts,
							})}
						</Text>
					</View>
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
									? t('health.database.first_check_pending', {
											defaultValue: 'First check pending…',
										})
									: lastCheck.status === 'error'
										? t('health.database.last_check_error', {
												defaultValue: "Last check didn't complete — retrying",
											})
										: t('health.database.watching', {
												defaultValue: 'Watching your server for changes — last check {ago}',
												ago: relative(lastCheck.atMs, nowMs),
											})}
							</Text>
						</HStack>
						<Text className="text-muted-foreground pl-3.5 text-xs">
							{censusWindow.updatedAtMs === null
								? t('health.database.totals_pending', {
										defaultValue: 'Server totals — first check pending',
									})
								: censusRefreshDue(censusWindow, nowMs)
									? t('health.database.totals_refreshing', {
											defaultValue: 'Server totals updated {ago} ago · refreshing now…',
											ago: relative(censusWindow.updatedAtMs, nowMs),
										})
									: t('health.database.totals_updated', {
											defaultValue: 'Server totals updated {ago} ago · next update in ~{next}',
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
							<ButtonText>
								{t('health.database.check_everything', { defaultValue: 'Check everything now' })}
							</ButtonText>
						</Button>
					</HStack>
				</HStack>
				<View className="h-4" />
			</VStack>
		</ScrollView>
	);
}
