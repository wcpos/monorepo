/** `_wcpos_gateway_attempts` schema 1, read with the plugin's own predicates (`Attempt_Log`). */

import { type MetaDataEntry, readLedger, samePaymentId } from './ledger';
import { parseMetaValue } from './meta-value';
import { withMetaReplaced } from './provenance';

export const GATEWAY_ATTEMPTS_META_KEY = '_wcpos_gateway_attempts';

export interface GatewayAttempt {
	id: string;
	methodId: string;
	cashierId: number;
	sentAtGmt: string | null;
	awaiting: { destination: string | null; atGmt: string | null } | null;
	flagged: boolean; // the resolver asked a human (`attention_at_gmt`)
}

type Entry = Record<string, unknown>;
const isEntry = (value: unknown): value is Entry =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value : null);
const mapOf = (metaData: readonly MetaDataEntry[] | null | undefined) =>
	metaData?.find(({ key }) => key === GATEWAY_ATTEMPTS_META_KEY)?.value;

/** Schema-1 entries in staged order (JSON insertion order, newest last); null for any other map. */
export function attemptEntries(metaData: readonly MetaDataEntry[] | null | undefined) {
	const map = parseMetaValue(mapOf(metaData));
	if (!isEntry(map) || map.schema !== 1 || !isEntry(map.attempts)) return null;
	// An entry with no method is skipped: the till could never post its `{method}/cancel`.
	return Object.entries(map.attempts).filter(
		(pair): pair is [string, Entry] => isEntry(pair[1]) && !!text(pair[1].method_id)
	);
}

function attemptOf([id, entry]: [string, Entry]): GatewayAttempt {
	const awaiting = isEntry(entry.awaiting) ? entry.awaiting : null;
	return {
		id,
		methodId: text(entry.method_id) ?? '',
		cashierId: typeof entry.cashier_id === 'number' ? entry.cashier_id : 0,
		sentAtGmt: text(entry.sent_at_gmt),
		awaiting: awaiting && { destination: text(awaiting.destination), atGmt: text(awaiting.at_gmt) },
		flagged: entry.attention_at_gmt != null,
	};
}

/** The newest owed attempt nobody awaits (`eligible('cancel')`), and the newest awaited one. */
export function readGatewayAttempts(metaData: readonly MetaDataEntry[] | null | undefined) {
	const entries = attemptEntries(metaData) ?? [];
	const newest = (pick: (pair: [string, Entry]) => boolean) =>
		entries.filter(pick).map(attemptOf).pop() ?? null;
	return {
		awaiting: newest(([, entry]) => isEntry(entry.awaiting)),
		unanswered: newest(([id, entry]) =>
			entry.fate === 'sent'
				? !isEntry(entry.awaiting)
				: entry.fate === 'paid' && !readLedger(metaData).some((row) => samePaymentId(row.id, id))
		),
	};
}

/** The one local patch of the map: merged into attempt `id` (created if missing), in the form found. */
export function withGatewayAttempt(
	metaData: readonly MetaDataEntry[] | null | undefined,
	id: string,
	patch: Entry
): MetaDataEntry[] {
	// Built from the reader's entries: a map that is not schema 1 starts fresh.
	const attempts = Object.fromEntries(attemptEntries(metaData) ?? []);
	const next = { schema: 1, attempts: { ...attempts, [id]: { ...attempts[id], ...patch } } };
	const value = typeof mapOf(metaData) === 'string' ? JSON.stringify(next) : next;
	return withMetaReplaced(metaData, [{ key: GATEWAY_ATTEMPTS_META_KEY, value }]);
}

/**
 * The store's `supersede()`, until the next adoption: every other `sent` attempt is `superseded`;
 * with `'awaiting'` only the ones awaiting the customer (`replace()`), so a stranded one stays.
 */
export function withSupersededAttempts(
	metaData: readonly MetaDataEntry[] | null | undefined,
	keepId: string,
	which: 'sent' | 'awaiting'
): readonly MetaDataEntry[] {
	let result = metaData ?? [];
	for (const [id, entry] of attemptEntries(metaData) ?? [])
		if (entry.fate === 'sent' && !samePaymentId(id, keepId))
			if (which === 'sent' || entry.awaiting != null)
				result = withGatewayAttempt(result, id, { fate: 'superseded', awaiting: null });
	return result;
}
