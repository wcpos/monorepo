import * as React from 'react';
import { View } from 'react-native';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../contexts/translations';
import { useQueryStateActions } from '../../../query';
import { useCensusTotals } from '../hooks/use-census-totals';
import { useCollectionCounts, useMutationCounts } from '../hooks/use-engine-monitor';
import { deriveSyncStatusCards, useSyncStatusDoc, useSyncStatusResource } from './use-sync-status';

import type { SyncStatusCard, SyncStatusState } from './use-sync-status';
import type { ObservableResource } from 'observable-hooks';

const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 30_000;

/** Telemetry name → the translation key (with fallback) for its label. */
const CARD_LABELS: Record<string, { key: string; fallback: string }> = {
	products: { key: 'common.products', fallback: 'Products' },
	variations: { key: 'common.variations', fallback: 'Variations' },
	customers: { key: 'common.customers', fallback: 'Customers' },
	orders: { key: 'common.orders', fallback: 'Orders' },
	tax_rates: { key: 'common.tax_rates', fallback: 'Tax rates' },
};

/**
 * One shared minute-resolution clock for the whole strip — a single 30s interval
 * drives the "checked Xm ago" lines and error-window expiry, rather than a timer
 * per card.
 */
function useNow(): number {
	const [now, setNow] = React.useState(() => Date.now());
	React.useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), TICK_MS);
		return () => clearInterval(id);
	}, []);
	return now;
}

type TFn = ReturnType<typeof useT>;

function SyncStatusRow({
	card,
	now,
	t,
	onShowErrors,
}: {
	card: SyncStatusCard;
	now: number;
	t: TFn;
	onShowErrors: (collection: string) => void;
}) {
	const label = t(CARD_LABELS[card.collection].key, {
		defaultValue: CARD_LABELS[card.collection].fallback,
	});

	const minutesAgo =
		card.lastCheckedAt === null
			? null
			: Math.max(0, Math.floor((now - card.lastCheckedAt) / 60000));
	const checkedText =
		minutesAgo === null
			? '—'
			: t('logs.sync_status_checked', {
					defaultValue: 'checked {minutes}m ago',
					minutes: minutesAgo,
				});

	const countText =
		card.serverTotal === null
			? card.localCount.toLocaleString()
			: t('logs.sync_status_count', {
					defaultValue: '{local} of {total}',
					local: card.localCount.toLocaleString(),
					total: card.serverTotal.toLocaleString(),
				});

	const showError = card.lastError !== null && now - card.lastError.at < DAY_MS;

	return (
		<HStack testID={`sync-status-card-${card.collection}`} className="items-center gap-2 py-1">
			<Text className="flex-1 text-sm">{label}</Text>
			<Text className="text-muted-foreground text-xs">{checkedText}</Text>
			<Text
				testID={`sync-status-count-${card.collection}`}
				className="text-muted-foreground text-xs tabular-nums"
			>
				{countText}
			</Text>
			{showError ? (
				<ButtonPill
					size="xs"
					variant="error"
					leftIcon="triangleExclamation"
					testID={`sync-status-error-${card.collection}`}
					onPress={() => onShowErrors(card.collection)}
				>
					<ButtonText>{t('logs.sync_status_errors', { defaultValue: 'Errors' })}</ButtonText>
				</ButtonPill>
			) : null}
		</HStack>
	);
}

function SyncStatusStripContent({ resource }: { resource: ObservableResource<SyncStatusState> }) {
	const doc = useSyncStatusDoc(resource);
	const census = useCensusTotals();
	const counts = useCollectionCounts();
	const { pending } = useMutationCounts();
	const { setFilter, setSearch } = useQueryStateActions<'logs'>();
	const t = useT();
	const now = useNow();

	const cards = React.useMemo(
		() => deriveSyncStatusCards(doc, census, counts),
		[doc, census, counts]
	);

	const showErrors = React.useCallback(
		(collection: string) => {
			// Mirror the filter bar: narrow the log stream to problems for this collection.
			setFilter('level', ['warn', 'error']);
			setSearch(collection);
		},
		[setFilter, setSearch]
	);

	return (
		<Card testID="logs-sync-status-strip">
			<CardHeader className="bg-card-header p-2">
				<HStack className="items-center justify-between">
					<Text className="text-sm font-semibold">
						{t('logs.sync_status', { defaultValue: 'Sync status' })}
					</Text>
					{pending > 0 ? (
						<View testID="sync-status-pending" className="bg-warning/15 rounded-full px-2 py-0.5">
							<Text className="text-warning text-xs">
								{t('logs.sync_status_pending', { defaultValue: '{count} pending', count: pending })}
							</Text>
						</View>
					) : null}
				</HStack>
			</CardHeader>
			<CardContent className="p-2">
				<VStack className="gap-0">
					{cards.map((card) => (
						<SyncStatusRow
							key={card.collection}
							card={card}
							now={now}
							t={t}
							onShowErrors={showErrors}
						/>
					))}
				</VStack>
			</CardContent>
		</Card>
	);
}

/**
 * A quiet, one-line-per-collection strip for the Logs screen: how long ago each
 * collection was last checked, how much of it is local, and a tappable badge that
 * jumps the log view to recent errors.
 */
export function SyncStatusStrip() {
	const resource = useSyncStatusResource();
	return (
		<Suspense fallback={null}>
			<SyncStatusStripContent resource={resource} />
		</Suspense>
	);
}
