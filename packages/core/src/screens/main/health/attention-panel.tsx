import * as React from 'react';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';
import { Callout } from './components';
import { useRecordEditRoute } from './record-edit-route';
import { useManualSync } from './use-manual-sync';
import { useRecordLabel } from './use-record-label';

import type { StuckRecord } from '../logs/logs-logic';

/**
 * Database-tab attention panel (spec §9): the derived stuck-records view made
 * actionable — server reason, Fix record (when an edit surface exists), Retry
 * (one guarded engine tick re-attempts the queue), View log.
 */
export function AttentionPanel({ stuck }: { stuck: StuckRecord[] }) {
	const t = useT();
	const router = useRouter();
	const { syncing, busy, sync } = useManualSync();
	const first = stuck[0];
	const label = useRecordLabel(first ? first.collection : undefined, first?.recordId);
	const editRoute = useRecordEditRoute();

	if (!first) return null;
	const collectionName = first.collection;

	// From the FOUND record's uuid: a pull-side row's id is the store's
	// numeric id, which no edit screen can open.
	const fixRoute = editRoute(collectionName, label?.status === 'found' ? label.uuid : null);
	// The handle alone when there is one — the sentence around it already says
	// what kind it is; otherwise the shared kind / "not on this device" line.
	// Never the raw id: support reads that from the log row's Details.
	const displayName = label?.handle ?? label?.text ?? collectionName;

	return (
		<Callout tone="destructive" testID="db-attention-panel">
			<HStack className="flex-wrap items-baseline gap-x-3 gap-y-1">
				<Text className="font-semibold">
					{/* `count` selects the plural form, `n` fills the placeholder — the
					    published catalogues interpolate {n}, and passing only `count`
					    renders a literal "{n}" to every non-English user. Asking for a
					    suffixed key by hand (the old `=== 1` branch) reached at most two
					    entries, so locales with more CLDR categories — ru's _few for 2–4,
					    ar's _zero/_two — could never render theirs. */}
					{t('health.database.attention', { count: stuck.length, n: stuck.length })}
				</Text>
				{/* Both interpolations are server-supplied and arrive HTML-encoded: the
				    record's own name ("Men&#8217;s T-shirt") and the server's refusal
				    sentence. Decoding here is the same treatment every other
				    server-sourced string gets before a cashier reads it. */}
				<Text className="text-muted-foreground min-w-0 flex-shrink text-sm" decodeHtml>
					{/* A pull-direction record never left the till in the first place —
					    saying "can't upload" told cashiers their sales were stranded
					    when the engine was only re-checking the catalogue. Only a push
					    is an upload. */}
					{first.status === 'deleted'
						? t('health.database.attention_reason_delete', {
								name: displayName,
								reason: first.reason,
							})
						: first.direction === 'pull'
							? t('health.database.attention_reason_pull', {
									name: displayName,
									reason: first.reason,
								})
							: t('health.database.attention_reason', {
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
							<ButtonText>{t('health.database.attention_fix')}</ButtonText>
						</Button>
					) : null}
					{first.retryable ? (
						<Button
							// Retry is the one constructive action of the row: default, sm.
							size="sm"
							testID="db-attention-retry"
							loading={syncing}
							disabled={busy}
							onPress={() => void sync()}
						>
							<ButtonText>{t('health.database.attention_retry')}</ButtonText>
						</Button>
					) : null}
					<Button
						variant="ghost"
						size="sm"
						testID="db-attention-view-log"
						onPress={() => router.push('/health/logs')}
					>
						<ButtonText>{t('health.database.attention_view_log')}</ButtonText>
					</Button>
				</HStack>
			</HStack>
		</Callout>
	);
}
