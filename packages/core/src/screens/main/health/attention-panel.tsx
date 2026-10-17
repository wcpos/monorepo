import * as React from 'react';

import { type Href, useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../contexts/translations';
import { Callout } from './components';
import { useManualSync } from './use-manual-sync';
import { useRecordLabel } from './use-record-label';

import type { StuckRecord } from '../logs/logs-logic';

/** Edit routes per collection — only collections with an edit surface link out.
 * Shared with the conflicted-mutations panel so the two surfaces can never
 * disagree about where a record is edited. */
export const FIX_ROUTES: Record<string, (uuid: string) => Href> = {
	products: (uuid) => `/(app)/(drawer)/products/(modals)/edit/product/${uuid}`,
	variations: (uuid) => `/(app)/(drawer)/products/(modals)/edit/variation/${uuid}`,
	orders: (uuid) => `/orders/edit/${uuid}`,
	customers: (uuid) => `/customers/edit/${uuid}`,
	coupons: (uuid) => `/coupons/edit/${uuid}`,
};

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
	const label = useRecordLabel(first?.collection, first?.recordId);

	if (!first) return null;

	const fixRoute = FIX_ROUTES[first.collection]?.(first.recordId);
	// The handle alone when there is one — the sentence around it already says
	// what kind it is; otherwise the shared kind / "not on this device" line.
	// Never the raw id: support reads that from the log row's Details.
	const displayName = label?.handle ?? label?.text ?? first.collection;

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
							variant="ghost"
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
						variant="ghost-quiet"
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
