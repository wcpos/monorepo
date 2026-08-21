import * as React from 'react';
import { Platform, Share, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { Tree } from '@wcpos/components/tree';
import { VStack } from '@wcpos/components/vstack';
import { isSyncEventType } from '@wcpos/utils/logger/generated/event-labels.generated';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import {
	type CatalogueEntry,
	ERROR_CATALOGUE,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { useLocalDate } from '../../../hooks/use-local-date';
import { type KVEntry, KVGrid, type LevelKind } from '../health/components';
import { translateEventDescription } from './generated/event-titles.generated';
import { eventTypeOf, type LogRow, rowDetailData } from './logs-logic';

export function catalogueFor(code: string | undefined): CatalogueEntry | null {
	if (!code) return null;
	return (ERROR_CATALOGUE as Record<string, CatalogueEntry>)[code as ErrorCode] ?? null;
}

/**
 * At most one guidance line per problem row, and only when it changes what the
 * cashier should do next — everything explanatory lives on the linked docs page
 * (owner ruling 2026-08-14/18). A risky data state leads; the safe next step
 * joins it as a second sentence. Benign states ("no impact", "verify first",
 * "keep working") render nothing. Literal t() calls per enum value — dynamic
 * keys are invisible to the i18n gate.
 */
function useGuidanceText(entry: CatalogueEntry | null): string | null {
	const t = useT();
	if (!entry) return null;

	let risk: string | null = null;
	switch (entry.dataSafety) {
		case 'money-moved':
			risk = t('health.logs.safety_money_moved');
			break;
		case 'outcome-unknown':
			risk = t('health.logs.safety_outcome_unknown');
			break;
		case 'data-at-risk':
			risk = t('health.logs.safety_data_at_risk');
			break;
	}

	let action: string | null = null;
	switch (entry.safeAction) {
		case 'retry':
			action = t('health.logs.action_retry');
			break;
		case 'retry-after-edit':
			action = t('health.logs.action_retry_after_edit');
			break;
		case 'repair-local':
			action = t('health.logs.action_repair_local');
			break;
		case 'reconfigure':
			action = t('health.logs.action_reconfigure');
			break;
		case 'contact-support':
			action = t('health.logs.action_contact_support');
			break;
	}

	const guidance = [risk, action].filter(Boolean).join(' ');
	return guidance.length > 0 ? guidance : null;
}

function EventCode({ eventType, logId }: { eventType: string; logId: string }) {
	const t = useT();
	const canShare = Platform.OS !== 'web';
	// Same capability guard as the debug-copy action in logs/index.tsx: outside a
	// secure context the Clipboard API is absent, and a button that only ever
	// error-toasts is worse than no button (the text stays selectable).
	const canCopy = !canShare && typeof navigator !== 'undefined' && !!navigator.clipboard;
	const handleCopy = React.useCallback(async () => {
		try {
			if (canShare) {
				await Share.share({ message: eventType });
				return;
			}
			await navigator.clipboard.writeText(eventType);
			Toast.show({ type: 'success', text1: t('health.logs.event_code_copied') });
		} catch {
			if (!canShare) {
				Toast.show({ type: 'error', text1: t('health.logs.event_code_copy_failed') });
			}
		}
	}, [canShare, eventType, t]);

	return (
		<HStack className="items-center gap-3">
			<Text className="text-muted-foreground w-24 text-xs">{t('health.logs.kv_event_code')}</Text>
			<Text selectable className="flex-1 font-mono text-xs">
				{eventType}
			</Text>
			{canShare || canCopy ? (
				<Button
					variant="ghost"
					size="xs"
					testID={`logs-copy-event-${logId}`}
					onPress={() => void handleCopy()}
				>
					<ButtonText>
						{canShare ? t('health.logs.share_event_code') : t('health.logs.copy_event_code')}
					</ButtonText>
				</Button>
			) : null}
		</HStack>
	);
}

/**
 * "Help — CODE" goes straight to the code's docs page — no in-app modal
 * (owner ruling 2026-08-14: link to docs, never verbose in-app copy; the docs
 * carry the registry body and troubleshooting).
 */
function HelpLink({ code }: { code: string }) {
	const t = useT();
	return (
		<DocsLink testID={`logs-help-${code}`} href={getErrorCodeDocURL(code)}>
			{t('health.logs.help_link', { code })}
		</DocsLink>
	);
}

/**
 * Inline expandable detail under a ledger row. Every kind shares one aligned
 * prose, facts, and context stack; problem rows add only a tone bar.
 *
 * `title` is the row's rendered (translated) title, passed in so the detail can
 * show the raw engine event code — the greppable identity support asks for —
 * next to it, and skip repeating the persisted message when it says the same
 * thing (#912).
 */
export function RowDetail({ row, kind, title }: { row: LogRow; kind: LevelKind; title?: string }) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const entry = catalogueFor(row.code);
	const detail = rowDetailData(row);
	const guidance = useGuidanceText(entry);
	const isProblem = kind === 'error' || kind === 'warn';

	const context = row.context ?? {};
	const reason =
		typeof context.reason === 'string' && context.reason.length > 0 ? context.reason : null;
	const eventType = eventTypeOf(row);
	const description =
		!isProblem && eventType !== undefined && isSyncEventType(eventType)
			? translateEventDescription((key) => t(key), eventType)
			: undefined;

	const entries: KVEntry[] = [];
	if (detail.operation) {
		entries.push({
			label: t('health.logs.kv_operation'),
			value: detail.operation,
		});
	}
	if (detail.request) {
		entries.push({
			label: t('health.logs.kv_request'),
			value: detail.request,
		});
	}
	if (detail.serverCode) {
		entries.push({
			label: t('health.logs.kv_server_code'),
			value: detail.serverCode,
		});
	}
	if (detail.attempts) {
		entries.push({
			label: t('health.logs.kv_attempts'),
			value: `${detail.attempts.count} · ${formatDate(new Date(detail.attempts.firstSeen), 'p')} → ${formatDate(
				new Date(detail.attempts.lastSeen),
				'p'
			)}`,
		});
	}

	// "The server said" framing only when the reason genuinely came back from
	// the server (push rejection / mapped server code) — client-side reasons
	// must not be put in the server's mouth.
	const isServerReason =
		reason !== null && (detail.serverCode !== undefined || context.direction === 'push');
	const explanation = isProblem
		? isServerReason
			? t('health.logs.server_said', { reason })
			: (entry?.summary ?? reason)
		: null;
	const narration =
		!isProblem && row.message && row.message !== title && row.message !== eventType
			? row.message
			: null;
	const hasContext = Object.keys(context).length > 0;
	const hasProse = isProblem
		? Boolean(explanation || guidance || (entry && row.code))
		: Boolean(description || narration);
	const hasFacts = Boolean(eventType || entries.length > 0);

	return (
		<VStack testID={`logs-detail-${row.logId}`} className="relative py-2 pl-4 md:ml-42 md:pl-0">
			{isProblem ? (
				<View
					className={cn(
						'absolute top-2 bottom-2 left-0 w-[3px] rounded-full md:-left-4',
						kind === 'error' ? 'bg-destructive' : 'bg-warning'
					)}
				/>
			) : null}
			{hasProse ? (
				<VStack className="gap-1">
					{isProblem ? (
						<>
							{explanation ? <Text className="font-medium">{explanation}</Text> : null}
							{guidance ? <Text className="text-sm font-medium">{guidance}</Text> : null}
							{entry && row.code ? <HelpLink code={row.code} /> : null}
						</>
					) : (
						<>
							{description ? <Text className="text-sm">{description}</Text> : null}
							{narration ? (
								<Text className="text-muted-foreground text-xs">{narration}</Text>
							) : null}
						</>
					)}
				</VStack>
			) : null}
			{hasFacts ? (
				<VStack className="gap-1">
					{eventType ? <EventCode eventType={eventType} logId={row.logId} /> : null}
					{entries.length > 0 ? <KVGrid entries={entries} /> : null}
				</VStack>
			) : null}
			{hasContext ? (
				<HStack className="items-baseline gap-3">
					<Text className="text-muted-foreground w-24 text-xs">{t('health.logs.kv_details')}</Text>
					<View className="flex-1">
						<Tree value={context} collapsed />
					</View>
				</HStack>
			) : null}
			{!hasProse && !hasFacts && !hasContext ? (
				<Text className="text-muted-foreground text-xs">{t('health.logs.no_detail')}</Text>
			) : null}
		</VStack>
	);
}
