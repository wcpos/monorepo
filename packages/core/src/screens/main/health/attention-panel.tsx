import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { useQueryManager } from '@wcpos/query';

import { useT } from '../../../contexts/translations';
import { Callout } from './components';
import { rowKeyForTelemetryCollection } from './database-logic';

import type { StuckRecord } from '../logs/logs-logic';

/** Edit routes per collection — only collections with an edit surface link out. */
const FIX_ROUTES: Record<string, (uuid: string) => string> = {
	products: (uuid) => `/(app)/(drawer)/products/(modals)/edit/product/${uuid}`,
	variations: (uuid) => `/(app)/(drawer)/products/(modals)/edit/variation/${uuid}`,
	orders: (uuid) => `/orders/edit/${uuid}`,
	customers: (uuid) => `/customers/edit/${uuid}`,
};

/**
 * Best-effort display name for the stuck record, read from the local doc
 * (products: name; orders: number; customers: first/last name or username). Falls back to
 * `collection/id` — the record always stays identifiable.
 */
function useStuckRecordLabel(stuck: StuckRecord | undefined): string | null {
	const { engine } = useQueryManager();
	// Keyed by the stuck record's identity: a stale resolution simply stops
	// matching instead of needing a synchronous reset in the effect.
	const [resolved, setResolved] = React.useState<{ key: string; label: string } | null>(null);

	// Effect (last resort per project.mdc): a one-shot async doc read with no
	// observable seam — the label is decoration on top of the log-derived row.
	React.useEffect(() => {
		if (!stuck) return;
		const rowKey = rowKeyForTelemetryCollection(stuck.collection);
		if (rowKey === null) return;
		let cancelled = false;
		void (async () => {
			try {
				const scope = engine.active() as {
					database?: { collections?: Record<string, unknown> };
				} | null;
				const collection = scope?.database?.collections?.[rowKey] as
					{ findOne(id: string): { exec(): Promise<Record<string, unknown> | null> } } | undefined;
				const doc = await collection?.findOne(stuck.recordId).exec();
				if (cancelled || !doc) return;
				const source = doc as { number?: unknown; payload?: Record<string, unknown> };
				const payload = source.payload ?? {};
				const customerName = [payload.first_name, payload.last_name]
					.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
					.map((part) => part.trim())
					.join(' ');
				const number = source.number ?? payload.number;
				const name =
					typeof payload.name === 'string' && payload.name.length > 0
						? payload.name
						: typeof number === 'string' || typeof number === 'number'
							? `#${number}`
							: customerName.length > 0
								? customerName
								: typeof payload.username === 'string'
									? payload.username
									: null;
				if (name) setResolved({ key: stuck.key, label: name });
			} catch {
				// Doc unavailable — the collection/id fallback still identifies it.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [engine, stuck]);

	return resolved !== null && stuck !== undefined && resolved.key === stuck.key
		? resolved.label
		: null;
}

/**
 * Database-tab attention panel (spec §9): the derived stuck-records view made
 * actionable — server reason, Fix record (when an edit surface exists), Retry
 * (one guarded engine tick re-attempts the queue), View log.
 */
export function AttentionPanel({ stuck }: { stuck: StuckRecord[] }) {
	const t = useT();
	const router = useRouter();
	const { engine } = useQueryManager();
	const first = stuck[0];
	const label = useStuckRecordLabel(first);

	if (!first) return null;

	const fixRoute = FIX_ROUTES[first.collection]?.(first.recordId);
	const displayName = label ?? `${first.collection}/${first.recordId.slice(0, 8)}`;

	return (
		<Callout tone="destructive" testID="db-attention-panel">
			<HStack className="flex-wrap items-baseline gap-x-3 gap-y-1">
				<Text className="font-semibold">
					{stuck.length === 1
						? t('health.database.attention_one', { defaultValue: '1 record needs attention' })
						: t('health.database.attention_many', {
								defaultValue: '{n} records need attention',
								n: stuck.length,
							})}
				</Text>
				<Text className="text-muted-foreground min-w-0 flex-shrink text-sm">
					{t('health.database.attention_reason', {
						defaultValue: '"{name}" can\'t upload — {reason}',
						name: displayName,
						reason: first.reason,
					})}
				</Text>
				<HStack className="items-center gap-1">
					{fixRoute ? (
						<Button
							variant="ghost"
							size="sm"
							testID="db-attention-fix"
							onPress={() => router.push(fixRoute)}
						>
							<ButtonText className="text-sm">
								{t('health.database.attention_fix', { defaultValue: 'Fix record' })}
							</ButtonText>
						</Button>
					) : null}
					{first.retryable ? (
						<Button
							variant="ghost"
							size="sm"
							testID="db-attention-retry"
							onPress={() => void engine.sync()}
						>
							<ButtonText className="text-sm">
								{t('health.database.attention_retry', { defaultValue: 'Retry' })}
							</ButtonText>
						</Button>
					) : null}
					<Button
						variant="ghost"
						size="sm"
						testID="db-attention-view-log"
						onPress={() => router.push('/health/logs')}
					>
						<ButtonText className="text-muted-foreground text-sm">
							{t('health.database.attention_view_log', { defaultValue: 'View log ›' })}
						</ButtonText>
					</Button>
				</HStack>
			</HStack>
		</Callout>
	);
}
