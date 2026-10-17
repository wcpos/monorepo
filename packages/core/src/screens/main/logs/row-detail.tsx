import * as React from 'react';
import { Platform, Share, View } from 'react-native';

import { type Href, useRouter } from 'expo-router';
import { decode } from 'html-entities';

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
import { FIX_ROUTES } from '../health/attention-panel';
import { type KVEntry, KVGrid, type LevelKind } from '../health/components';
import { useRecordLabel } from '../health/use-record-label';
import { translateErrorAction } from './generated/error-actions.generated';
import { translateErrorSummary } from './generated/error-summaries.generated';
import { translateEventDescription } from './generated/event-titles.generated';
import {
	buildLogEntryReport,
	eventTypeOf,
	type LogRow,
	recordRefOf,
	rowDetailData,
} from './logs-logic';

export function catalogueFor(code: string | undefined): CatalogueEntry | null {
	if (!code) return null;
	return (ERROR_CATALOGUE as Record<string, CatalogueEntry>)[code as ErrorCode] ?? null;
}

/**
 * At most one guidance line per problem row, and only when it changes what the
 * cashier should do next — everything explanatory lives on the linked docs page
 * (owner ruling 2026-08-14/18). A risky data state leads; the safe next step
 * joins it as a second sentence. Per-code actions resolve through generated
 * literal t() calls so the i18n extractor sees every key.
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
		case 'local-only':
			// Nothing on the server moved, but what this device holds may be
			// affected (e.g. AUTH131: a re-added site opens a fresh local copy of
			// the store). The merchant must hear that before clearing anything.
			risk = t('health.logs.safety_local_only');
			break;
	}

	const action = translateErrorAction((key) => t(key), entry.code);

	const guidance = [risk, action].filter(Boolean).join(' ');
	return guidance.length > 0 ? guidance : null;
}

/**
 * The event-code line, and the row's copy/share action.
 *
 * The action hands over the WHOLE entry (`buildLogEntryReport`), not the event
 * code it sits beside. Copying the code alone named the kind of thing that
 * happened and nothing about the one that did — no order, no figures, no error
 * code — so a merchant pasting it into a support thread said nothing anyone
 * could act on. The button keeps its place on this line because that is where
 * merchants have learnt to find it; only what it yields changed, which is why
 * its label and toast keys are renamed rather than edited (a stale translation
 * of "Copy event code" on a button that copies everything is worse than an
 * untranslated one).
 */
function EventCode({ row, eventType, logId }: { row: LogRow; eventType: string; logId: string }) {
	const t = useT();
	const canShare = Platform.OS !== 'web';
	// Same capability guard as the debug-copy action in logs/index.tsx: outside a
	// secure context the Clipboard API is absent, and a button that only ever
	// error-toasts is worse than no button (the text stays selectable).
	const canCopy = !canShare && typeof navigator !== 'undefined' && !!navigator.clipboard;
	const handleCopy = React.useCallback(async () => {
		try {
			const report = buildLogEntryReport(row);
			if (canShare) {
				await Share.share({ message: report });
				return;
			}
			await navigator.clipboard.writeText(report);
			Toast.show({ type: 'success', text1: t('health.logs.entry_copied') });
		} catch {
			if (!canShare) {
				Toast.show({ type: 'error', text1: t('health.logs.entry_copy_failed') });
			}
		}
	}, [canShare, row, t]);

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
						{canShare ? t('health.logs.share_entry') : t('health.logs.copy_entry')}
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
 * Codes resolved in Store health → Database: the held-changes, rejected and
 * attention panels sit at the top of that tab, so landing on it is landing on
 * them.
 */
const DATABASE_CODES: ReadonlySet<string> = new Set([
	'SYNC201',
	'SYNC211',
	'SYNC221',
	'SYNC321',
	'SYNC331',
]);

/**
 * The way from the row to where its problem is fixed: the record's own edit
 * screen when it has one and this device holds it, and the Database tab for
 * the codes resolved there. The copy says "Open Store health → Database…";
 * this makes it one tap.
 */
function RowActions({
	logId,
	openRecord,
	toDatabase,
}: {
	logId: string;
	openRecord: Href | null;
	toDatabase: boolean;
}) {
	const t = useT();
	const router = useRouter();
	if (!openRecord && !toDatabase) return null;
	return (
		<HStack className="flex-wrap items-center gap-1">
			{openRecord ? (
				<Button
					variant="ghost"
					size="sm"
					testID={`logs-open-record-${logId}`}
					onPress={() => router.push(openRecord)}
				>
					<ButtonText>{t('health.logs.open_record')}</ButtonText>
				</Button>
			) : null}
			{toDatabase ? (
				<Button
					variant="ghost"
					size="sm"
					testID={`logs-go-database-${logId}`}
					onPress={() => router.push('/health/database')}
				>
					<ButtonText>{t('health.logs.go_to_database')}</ButtonText>
				</Button>
			) : null}
		</HStack>
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
	// Any row with a registered code gets its summary, guidance and Help,
	// whatever its level: a "Nothing to do" code logged at info still has to
	// SAY nothing is needed, or the row is a title with no meaning.
	const showsGuidance = isProblem || entry !== null;
	const record = recordRefOf(row);
	const recordLabel = useRecordLabel(record?.collection, record?.recordId);
	// Only once the record is FOUND: a tap while the read is in flight must not
	// open an edit screen for a record this device may not hold. The route is
	// keyed by the uuid the read returned (pull rows carry the store's id).
	const fixRoute =
		record && recordLabel?.status === 'found' && recordLabel.uuid
			? (FIX_ROUTES[record.collection]?.(recordLabel.uuid) ?? null)
			: null;
	const context = row.context ?? {};
	// Only a row about a record or a queued change has anything on the Database
	// tab (SYNC211 is also stamped on settings/auth 400s), and a recovered or
	// settled row has nothing left there — an auto-reverted SYNC201 already
	// restored the store's copy.
	const hasRecordContext =
		(context.recordId !== undefined && context.recordId !== null) ||
		(context.mutationId !== undefined && context.mutationId !== null);
	const toDatabase =
		row.code !== undefined &&
		DATABASE_CODES.has(row.code) &&
		hasRecordContext &&
		row.outcome !== 'recovered' &&
		row.outcome !== 'ok';

	const reason =
		typeof context.reason === 'string' && context.reason.length > 0 ? context.reason : null;
	const eventType = eventTypeOf(row);
	const description =
		!showsGuidance && eventType !== undefined && isSyncEventType(eventType)
			? translateEventDescription((key) => t(key), eventType)
			: undefined;

	const entries: KVEntry[] = [];
	if (recordLabel) {
		// Names arrive the way the catalogue stores them ("Men&#8217;s T-shirt").
		entries.push({ label: t('health.logs.kv_record'), value: decode(recordLabel.text) });
	}
	if (detail.field) entries.push({ label: t('health.logs.kv_field'), value: detail.field });
	if (detail.sku) entries.push({ label: t('health.logs.kv_sku'), value: detail.sku });
	if (detail.overwrittenFields) {
		entries.push({
			label: t('health.logs.kv_overwritten_fields'),
			value: detail.overwrittenFields,
		});
	}
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

	// "The server said" framing only when the sentence genuinely came back from
	// the server: `serverMessage` is the error body's own prose by construction
	// (the observer copies it from the engine event, which reads it off the wire),
	// and a `reason` counts when the row carries a server code or is a push
	// rejection — client-side reasons must not be put in the server's mouth.
	const serverMessage =
		typeof context.serverMessage === 'string' && context.serverMessage.trim() !== ''
			? context.serverMessage
			: null;
	const isServerReason =
		reason !== null && (detail.serverCode !== undefined || context.direction === 'push');
	// The server's sentence beats its machine code. A WordPress fatal answers
	// `internal_server_error` with the PHP error itself ("Allowed memory size of
	// 134217728 bytes exhausted") in `serverMessage`; quoting the code sent a
	// merchant to the server logs for an answer the row already held (#2439). The
	// code is still on the row, in the Details tree.
	const serverSaid = serverMessage ?? (isServerReason ? reason : null);
	// `entry.summary` is the registry's ENGLISH copy — the generated
	// `translateErrorSummary` resolves the same string through the catalogue, so
	// the reason renders in the language the till runs TODAY. Reading the raw
	// field here put one English sentence between a translated title and
	// translated guidance on every non-English till, and on a row with no
	// registered event type (the 147 code-carrying `logger.error` call sites in
	// packages/core) it was the only merchant-readable sentence on the row.
	const explanation = showsGuidance
		? serverSaid !== null
			? t('health.logs.server_said', { reason: serverSaid })
			: entry
				? translateErrorSummary((key) => t(key), entry.code)
				: reason
		: null;
	// A code-carrying row with no registered event type is now TITLED from that
	// same summary (`useEventTitle`, #2439), so the lead line would repeat the
	// title word for word — the same dedupe `narration` applies to quiet rows.
	const lead = explanation !== null && explanation !== title ? explanation : null;
	// The store's own sentence joins the facts (after the record) unless the lead
	// already quotes it; WP REST ships it HTML-encoded, as on the lead line.
	if (detail.serverMessage && !(lead !== null && serverSaid === serverMessage)) {
		entries.splice(recordLabel ? 1 : 0, 0, {
			label: t('health.logs.kv_server_message'),
			value: decode(detail.serverMessage),
		});
	}
	// The persisted message, when it says something the row does not already say.
	// On a quiet row it is the narration under the event description. On a
	// problem row it is shown only when there is NO registered engine event: an
	// engine row's message is a formulaic restatement of its context, but a
	// `logger.error(<dynamic>, { code })` row's message is often the only place
	// the specifics live (the security plugin's own sentence, `String(error)`),
	// and until #2439 it WAS the title — titling from the code summary must not
	// make it disappear.
	const isEngineRow = eventType !== undefined && isSyncEventType(eventType);
	const narration =
		row.message &&
		row.message !== title &&
		row.message !== eventType &&
		row.message !== lead &&
		(!showsGuidance || !isEngineRow)
			? row.message
			: null;
	const hasContext = Object.keys(context).length > 0;
	const hasActions = fixRoute !== null || toDatabase;
	const hasProse = showsGuidance
		? Boolean(lead || guidance || narration || (entry && row.code) || hasActions)
		: Boolean(description || narration || hasActions);
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
					{showsGuidance ? (
						<>
							{/* On the server-said branch this IS the server's own sentence, and WP
							    REST ships its error copy HTML-encoded — decode so the row reads
							    as prose rather than markup. */}
							{lead ? (
								<Text className="font-medium" decodeHtml>
									{lead}
								</Text>
							) : null}
							{guidance ? <Text className="text-sm font-medium">{guidance}</Text> : null}
							{narration ? (
								<Text className="text-muted-foreground text-xs">{narration}</Text>
							) : null}
							<RowActions logId={row.logId} openRecord={fixRoute} toDatabase={toDatabase} />
							{entry && row.code ? <HelpLink code={row.code} /> : null}
						</>
					) : (
						<>
							{description ? <Text className="text-sm">{description}</Text> : null}
							{narration ? (
								<Text className="text-muted-foreground text-xs">{narration}</Text>
							) : null}
							<RowActions logId={row.logId} openRecord={fixRoute} toDatabase={toDatabase} />
						</>
					)}
				</VStack>
			) : null}
			{hasFacts ? (
				<VStack className="gap-1">
					{eventType ? <EventCode row={row} eventType={eventType} logId={row.logId} /> : null}
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
