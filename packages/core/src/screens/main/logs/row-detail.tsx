import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { Tree } from '@wcpos/components/tree';
import { VStack } from '@wcpos/components/vstack';
import {
	type CatalogueEntry,
	ERROR_CATALOGUE,
	type ErrorCode,
} from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';
import { useLocalDate } from '../../../hooks/use-local-date';
import { Callout, type KVEntry, KVGrid, type LevelKind } from '../health/components';
import { type LogRow, rowDetailData } from './logs-logic';

export function catalogueFor(code: string | undefined): CatalogueEntry | null {
	if (!code) return null;
	return (ERROR_CATALOGUE as Record<string, CatalogueEntry>)[code as ErrorCode] ?? null;
}

/** Literal t() calls per enum value — dynamic keys are invisible to the i18n gate. */
function useDataSafetyText(dataSafety: CatalogueEntry['dataSafety'] | undefined): string | null {
	const t = useT();
	switch (dataSafety) {
		case 'no-impact':
			return t('health.logs.safety_no_impact', {
				defaultValue: 'No sales or data are affected.',
			});
		case 'local-only':
			return t('health.logs.safety_local_only', {
				defaultValue: 'Your work is saved on this device and nothing is lost.',
			});
		case 'order-safe':
			return t('health.logs.safety_order_safe', {
				defaultValue: 'The order is safe — sale records are not affected.',
			});
		case 'money-moved':
			return t('health.logs.safety_money_moved', {
				defaultValue: 'Payment has been taken — check the order before retrying.',
			});
		case 'outcome-unknown':
			return t('health.logs.safety_outcome_unknown', {
				defaultValue: "The final result couldn't be confirmed — verify before retrying.",
			});
		case 'data-at-risk':
			return t('health.logs.safety_data_at_risk', {
				defaultValue: 'Data on this device may be affected — export diagnostics before repairing.',
			});
		default:
			return null;
	}
}

function useSafeActionText(safeAction: CatalogueEntry['safeAction'] | undefined): string | null {
	const t = useT();
	switch (safeAction) {
		case 'retry':
			return t('health.logs.action_retry', { defaultValue: 'It is safe to try again.' });
		case 'retry-after-edit':
			return t('health.logs.action_retry_after_edit', {
				defaultValue: 'Fix the issue above, then retry.',
			});
		case 'verify-first':
			return t('health.logs.action_verify_first', {
				defaultValue: 'Verify what happened before you retry.',
			});
		case 'continue':
			return t('health.logs.action_continue', {
				defaultValue: 'You can keep working — nothing to do.',
			});
		case 'repair-local':
			return t('health.logs.action_repair_local', {
				defaultValue: 'Repair from Store health → Database.',
			});
		case 'reconfigure':
			return t('health.logs.action_reconfigure', {
				defaultValue: 'Review the related settings.',
			});
		case 'contact-support':
			return t('health.logs.action_contact_support', {
				defaultValue: 'Contact support and include this code.',
			});
		default:
			return null;
	}
}

/**
 * In-app error catalogue entry (spec §5, offline layer). The docs body is
 * registry English until the registry workstream generates i18n keys.
 */
function HelpDialog({ code, entry }: { code: string; entry: CatalogueEntry }) {
	const t = useT();
	const dataSafety = useDataSafetyText(entry.dataSafety);
	const safeAction = useSafeActionText(entry.safeAction);
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" testID={`logs-help-${code}`} className="self-start px-0">
					<Text className="text-muted-foreground text-xs font-semibold">
						{t('health.logs.help_code', { defaultValue: 'Help — {code} ›', code })}
					</Text>
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>{code}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<VStack className="gap-3">
						<Text className="font-medium">{entry.summary}</Text>
						{dataSafety ? <Text className="text-sm">{dataSafety}</Text> : null}
						{safeAction ? (
							<Text className="text-success text-sm font-medium">{safeAction}</Text>
						) : null}
						{entry.docsBody
							.split('\n\n')
							.filter((paragraph) => paragraph.trim().length > 0)
							.map((paragraph) => (
								<Text key={paragraph.slice(0, 32)} className="text-muted-foreground text-sm">
									{paragraph.trim()}
								</Text>
							))}
					</VStack>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Inline expandable detail under a ledger row. Problems get the callout
 * treatment (plain-language reason, data-safety line, safe next step, help,
 * correlation KV); quiet rows get the correlation KV and raw context.
 */
export function RowDetail({ row, kind }: { row: LogRow; kind: LevelKind }) {
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

	const entries: KVEntry[] = [];
	if (detail.operation) {
		entries.push({
			label: t('health.logs.kv_operation', { defaultValue: 'Operation' }),
			value: detail.operation,
		});
	}
	if (detail.request) {
		entries.push({
			label: t('health.logs.kv_request', { defaultValue: 'Request' }),
			value: detail.request,
		});
	}
	if (detail.serverCode) {
		entries.push({
			label: t('health.logs.kv_server_code', { defaultValue: 'Server code' }),
			value: detail.serverCode,
		});
	}
	if (detail.attempts) {
		entries.push({
			label: t('health.logs.kv_attempts', { defaultValue: 'Attempts' }),
			value: `${detail.attempts.count} · ${formatDate(new Date(detail.attempts.firstSeen), 'p')} → ${formatDate(
				new Date(detail.attempts.lastSeen),
				'p'
			)}`,
		});
	}

	if (!isProblem) {
		const hasContext = Object.keys(context).length > 0;
		return (
			<VStack testID={`logs-detail-${row.logId}`} className="gap-2 py-2 pl-4">
				{entries.length > 0 ? <KVGrid entries={entries} /> : null}
				{hasContext ? <Tree value={context} collapsed /> : null}
				{entries.length === 0 && !hasContext ? (
					<Text className="text-muted-foreground text-xs">
						{t('health.logs.no_detail', { defaultValue: 'No further detail for this entry.' })}
					</Text>
				) : null}
			</VStack>
		);
	}

	// "The server said" framing only when the reason genuinely came back from
	// the server (push rejection / mapped server code) — client-side reasons
	// must not be put in the server's mouth.
	const isServerReason =
		reason !== null && (detail.serverCode !== undefined || context.direction === 'push');
	const title = isServerReason
		? t('health.logs.server_said', { defaultValue: 'The server said: {reason}', reason })
		: (entry?.summary ?? reason ?? row.message ?? '');

	return (
		<View testID={`logs-detail-${row.logId}`} className="py-2">
			<Callout tone={kind === 'error' ? 'destructive' : 'warning'}>
				<View className="flex-col gap-x-8 gap-y-2 md:flex-row">
					<VStack className="flex-1 gap-1">
						<Text className="font-medium">{title}</Text>
						{dataSafety ? (
							<Text className="text-muted-foreground text-sm">{dataSafety}</Text>
						) : null}
						{safeAction ? (
							<Text className="text-success text-sm font-medium">{safeAction}</Text>
						) : null}
						{entry && row.code ? <HelpDialog code={row.code} entry={entry} /> : null}
					</VStack>
					{entries.length > 0 ? (
						<View className="md:w-72">
							<KVGrid entries={entries} />
						</View>
					) : null}
				</View>
			</Callout>
		</View>
	);
}
