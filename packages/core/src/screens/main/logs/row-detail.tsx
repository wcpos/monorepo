import * as React from 'react';
import { Linking, Platform, Share, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
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
import { Callout, type KVEntry, KVGrid, type LevelKind } from '../health/components';
import { translateEventDescription } from './generated/event-titles.generated';
import { eventTypeOf, type LogRow, rowDetailData } from './logs-logic';

export function catalogueFor(code: string | undefined): CatalogueEntry | null {
	if (!code) return null;
	return (ERROR_CATALOGUE as Record<string, CatalogueEntry>)[code as ErrorCode] ?? null;
}

/** Literal t() calls per enum value — dynamic keys are invisible to the i18n gate. */
function useDataSafetyText(dataSafety: CatalogueEntry['dataSafety'] | undefined): string | null {
	const t = useT();
	switch (dataSafety) {
		case 'no-impact':
			return t('health.logs.safety_no_impact');
		case 'local-only':
			return t('health.logs.safety_local_only');
		case 'order-safe':
			return t('health.logs.safety_order_safe');
		case 'money-moved':
			return t('health.logs.safety_money_moved');
		case 'outcome-unknown':
			return t('health.logs.safety_outcome_unknown');
		case 'data-at-risk':
			return t('health.logs.safety_data_at_risk');
		default:
			return null;
	}
}

function useSafeActionText(safeAction: CatalogueEntry['safeAction'] | undefined): string | null {
	const t = useT();
	switch (safeAction) {
		case 'retry':
			return t('health.logs.action_retry');
		case 'retry-after-edit':
			return t('health.logs.action_retry_after_edit');
		case 'verify-first':
			return t('health.logs.action_verify_first');
		case 'continue':
			return t('health.logs.action_continue');
		case 'repair-local':
			return t('health.logs.action_repair_local');
		case 'reconfigure':
			return t('health.logs.action_reconfigure');
		case 'contact-support':
			return t('health.logs.action_contact_support');
		default:
			return null;
	}
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
 * "Help — CODE ›" goes straight to the code's docs page — no in-app modal
 * (owner ruling 2026-08-14: link to docs, never verbose in-app copy; the docs
 * carry the registry body and troubleshooting).
 */
function HelpLink({ code }: { code: string }) {
	const t = useT();
	return (
		<Button
			variant="ghost-quiet"
			size="xs"
			testID={`logs-help-${code}`}
			className="self-start px-0"
			onPress={() => Linking.openURL(getErrorCodeDocURL(code))}
		>
			<ButtonText className="font-semibold">{t('health.logs.help_code', { code })}</ButtonText>
		</Button>
	);
}

/**
 * The benign registry states are noise in an expanded row ("No sales or data
 * are affected", "Verify what happened before you retry") — the row only earns
 * an extra line when it changes what the cashier should do next.
 */
function showDataSafety(dataSafety: CatalogueEntry['dataSafety'] | undefined): boolean {
	return (
		dataSafety === 'money-moved' ||
		dataSafety === 'outcome-unknown' ||
		dataSafety === 'data-at-risk'
	);
}

function showSafeAction(safeAction: CatalogueEntry['safeAction'] | undefined): boolean {
	return safeAction !== undefined && safeAction !== 'verify-first' && safeAction !== 'continue';
}

/**
 * Inline expandable detail under a ledger row. Problems get the callout
 * treatment (plain-language reason, data-safety line, safe next step, help,
 * correlation KV); quiet rows get the correlation KV and raw context.
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
	const dataSafety = useDataSafetyText(entry?.dataSafety);
	const safeAction = useSafeActionText(entry?.safeAction);
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

	if (!isProblem) {
		const hasContext = Object.keys(context).length > 0;
		// The persisted message is the emitter's own narration. It is not the
		// title any more (that is translated from the event code), so show it
		// here when it adds something the title does not already say.
		const narration = row.message && row.message !== title ? row.message : null;
		return (
			<VStack testID={`logs-detail-${row.logId}`} className="gap-2 py-2 pl-4">
				{description ? <Text className="text-sm">{description}</Text> : null}
				{narration ? <Text className="text-muted-foreground text-xs">{narration}</Text> : null}
				{eventType ? <EventCode eventType={eventType} logId={row.logId} /> : null}
				{entries.length > 0 ? <KVGrid entries={entries} /> : null}
				{hasContext ? <Tree value={context} collapsed /> : null}
				{entries.length === 0 && !hasContext && !narration && !description ? (
					<Text className="text-muted-foreground text-xs">{t('health.logs.no_detail')}</Text>
				) : null}
			</VStack>
		);
	}

	// "The server said" framing only when the reason genuinely came back from
	// the server (push rejection / mapped server code) — client-side reasons
	// must not be put in the server's mouth.
	const isServerReason =
		reason !== null && (detail.serverCode !== undefined || context.direction === 'push');
	const explanation = isServerReason
		? t('health.logs.server_said', { reason })
		: (entry?.summary ?? reason ?? row.message ?? '');

	return (
		<View testID={`logs-detail-${row.logId}`} className="py-2">
			<Callout tone={kind === 'error' ? 'destructive' : 'warning'}>
				<View className="flex-col gap-x-8 gap-y-2 md:flex-row">
					<VStack className="flex-1 gap-1">
						<Text className="font-medium">{explanation}</Text>
						{dataSafety && showDataSafety(entry?.dataSafety) ? (
							<Text className="text-muted-foreground text-sm">{dataSafety}</Text>
						) : null}
						{safeAction && showSafeAction(entry?.safeAction) ? (
							<Text className="text-success text-sm font-medium">{safeAction}</Text>
						) : null}
						{entry && row.code ? <HelpLink code={row.code} /> : null}
					</VStack>
					{eventType || entries.length > 0 ? (
						<View className="md:w-72">
							{eventType ? <EventCode eventType={eventType} logId={row.logId} /> : null}
							{entries.length > 0 ? <KVGrid entries={entries} /> : null}
						</View>
					) : null}
				</View>
			</Callout>
		</View>
	);
}
