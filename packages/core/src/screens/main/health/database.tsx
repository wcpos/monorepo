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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { prepareCollectionResetRefill, useQueryManager } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import {
	useCollectionCounts,
	useEngineStatus,
	useMutationCounts,
} from '../hooks/use-engine-monitor';
import { useCensusTotals } from '../hooks/use-census-totals';
import {
	type CollectionKey,
	type CollectionRow,
	deriveRows,
	formatBytes,
	isReadyToSell,
	totalLocalRecords,
} from './database-logic';

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

function PercentBar({ percent }: { percent: number }) {
	return (
		<View className="bg-muted h-1 w-16 overflow-hidden rounded-full">
			<View className="bg-success h-1 rounded-full" style={{ width: `${percent}%` }} />
		</View>
	);
}

function CollectionRowView({ row, label }: { row: CollectionRow; label: string }) {
	const t = useT();
	const { engine } = useQueryManager();
	const [confirming, setConfirming] = React.useState(false);

	const resetCollection = async () => {
		setConfirming(false);
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
	};

	return (
		<HStack testID={`db-row-${row.key}`} className="border-border items-center gap-3 border-b py-2">
			<Text className="flex-1">{label}</Text>
			<Text className="w-20 text-right tabular-nums">{row.local.toLocaleString()}</Text>
			<View className="w-28 items-end">
				{row.windowed ? (
					<Text className="text-muted-foreground text-right text-xs">
						{t('health.database.orders_policy', {
							defaultValue: 'open + recent · older load when viewed',
						})}
					</Text>
				) : row.fresh && row.serverTotal !== null ? (
					<HStack className="items-center gap-2">
						<Text className="text-muted-foreground text-xs tabular-nums">
							{t('health.database.of_total', {
								defaultValue: 'of {total}',
								total: row.serverTotal.toLocaleString(),
							})}
						</Text>
						{row.percentLocal !== null ? <PercentBar percent={row.percentLocal} /> : null}
					</HStack>
				) : (
					<Text className="text-muted-foreground text-right text-xs">
						{t('health.database.total_unknown', { defaultValue: 'server total unknown' })}
					</Text>
				)}
			</View>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" testID={`db-row-menu-${row.key}`}>
						<Icon name="ellipsisVertical" className="text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onPress={() => void engine.sync()}>
						<Text>{t('health.database.sync_now', { defaultValue: 'Sync now' })}</Text>
					</DropdownMenuItem>
					<DropdownMenuItem onPress={() => setConfirming(true)}>
						<Text className="text-destructive">
							{t('health.database.clear_redownload', { defaultValue: 'Clear & re-download…' })}
						</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

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
											'{count} {label} will be removed and re-downloaded fresh from your server. Sales and orders are not affected. You can keep selling — search may be incomplete for a minute.',
										count: row.local.toLocaleString(),
										label: label.toLowerCase(),
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
		</HStack>
	);
}

/**
 * Store health · Database — "your store, on this device". Approved design:
 * docs/mockups/2026-07-16-health-database-page.html. Every number traces to a
 * real engine source (observability audit); % local shows only against a fresh
 * server census, never a local-count denominator.
 */
export function DatabaseScreen() {
	const t = useT();
	const { engine } = useQueryManager();
	const status = useEngineStatus();
	const counts = useCollectionCounts();
	const census = useCensusTotals();
	const mutations = useMutationCounts();
	const storageBytes = useStorageEstimate();

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
				<HStack className="border-border flex-wrap gap-6 border-b pb-3">
					<VStack className="gap-0">
						<Text
							className={readyToSell ? 'text-success font-semibold' : 'text-warning font-semibold'}
						>
							{readyToSell
								? t('health.database.ready', { defaultValue: 'Ready to sell' })
								: t('health.database.preparing', { defaultValue: 'Preparing…' })}
						</Text>
						<Text className="text-muted-foreground text-xs">
							{t('health.database.ready_sub', { defaultValue: 'catalog & open orders local' })}
						</Text>
					</VStack>
					<VStack className="gap-0">
						<Text className="font-semibold tabular-nums">{totalRecords.toLocaleString()}</Text>
						<Text className="text-muted-foreground text-xs">
							{t('health.database.records_on_device', { defaultValue: 'records on this device' })}
						</Text>
					</VStack>
					{storageText ? (
						<VStack className="gap-0">
							<Text className="font-semibold tabular-nums">{storageText}</Text>
							<Text className="text-muted-foreground text-xs">
								{t('health.database.storage_used', { defaultValue: 'storage used' })}
							</Text>
						</VStack>
					) : null}
					<VStack className="gap-0">
						<Text
							className={
								mutations.pending > 0 ? 'text-warning font-semibold' : 'text-success font-semibold'
							}
						>
							{mutations.pending}
						</Text>
						<Text className="text-muted-foreground text-xs">
							{t('health.database.waiting_to_send', { defaultValue: 'changes waiting to send' })}
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

				{/* Per-collection table */}
				<VStack className="gap-0">
					<HStack className="border-border items-center gap-3 border-b pb-1">
						<Text className="text-muted-foreground flex-1 text-xs uppercase">
							{t('health.database.col_collection', { defaultValue: 'Collection' })}
						</Text>
						<Text className="text-muted-foreground w-20 text-right text-xs uppercase">
							{t('health.database.col_on_device', { defaultValue: 'On device' })}
						</Text>
						<Text className="text-muted-foreground w-28 text-right text-xs uppercase">
							{t('health.database.col_on_server', { defaultValue: 'On server' })}
						</Text>
						<View className="w-9" />
					</HStack>
					{rows.map((row) => (
						<CollectionRowView
							key={row.key}
							row={row}
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

				<HStack className="flex-wrap items-center justify-between gap-2 pt-1">
					<Text className="text-muted-foreground text-xs">
						{lastCheck === null
							? t('health.database.first_check_pending', { defaultValue: 'First check pending…' })
							: lastCheck.status === 'error'
								? t('health.database.last_check_error', {
										defaultValue: "Last check didn't complete — retrying",
									})
								: t('health.database.last_check_ok', {
										defaultValue: 'Checked for changes',
									})}
					</Text>
					<Button variant="outline" size="sm" onPress={() => void engine.sync()}>
						<ButtonText>
							{t('health.database.check_everything', { defaultValue: 'Check everything now' })}
						</ButtonText>
					</Button>
				</HStack>
				<View className="h-4" />
			</VStack>
		</ScrollView>
	);
}
