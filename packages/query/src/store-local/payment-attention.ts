import { map } from 'rxjs/operators';

import type { PaymentRowRefusal } from '@wcpos/sync-core';

import { ensureLocalDocument, storeDatabase } from './ensure-local-document';

import type { StoreLocalDatabase } from '../reads/store-local';

/**
 * Refused payment rows the cashier still has to act on (ADR 0040 Decided 1 rule 4): one failed
 * story, told once, and never retried on its own. The store refused money the till already took,
 * so only the cashier can settle it (a refund, or the store's balance instead).
 *
 * Durable on purpose: the log feed is per session, and a needs-attention banner sourced from it
 * vanished on restart (#832, see `health/use-dead-letter-attention.ts`). A local document in the
 * store database is per store and outlives reloads, pulls, resets and cashier switches.
 */
export interface PaymentAttentionEntry {
	readonly rowId: string;
	readonly orderUuid: string;
	readonly orderId: number | null;
	readonly orderNumber: string | null;
	readonly amount: string;
	readonly currency: string;
	readonly methodId: string;
	readonly methodTitle: string;
	readonly reason: PaymentRowRefusal;
	/** The cashier-readable sentence the refusal was logged with. */
	readonly message: string;
	readonly refusedAt: string;
	/** Stamped when the cashier marks it handled; the entry stays until it is pruned. */
	readonly resolvedAt: string | null;
}
type Attention = { entries: Record<string, PaymentAttentionEntry> };
const ID = 'payment-attention';

/**
 * How long a handled entry is kept before the next write prunes it. Long enough to read back what
 * was handled across a month's close, short enough that the one document stays small; there is no
 * scheduler, so pruning rides the next record or resolve.
 */
export const RESOLVED_ATTENTION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function modifyAttention(
	storeDB: StoreLocalDatabase,
	modify: (entries: Record<string, PaymentAttentionEntry>) => void
) {
	const doc = await ensureLocalDocument<Attention>(storeDB, ID, { entries: {} });
	await doc.incrementalModify((data) => {
		modify(data.entries);
		const now = Date.now();
		for (const [rowId, entry] of Object.entries(data.entries))
			if (entry.resolvedAt && now - Date.parse(entry.resolvedAt) > RESOLVED_ATTENTION_RETENTION_MS)
				delete data.entries[rowId];
		return data;
	});
}

/**
 * Raise (or re-raise) the row's entry. Keyed by row id: a second refusal of the same row is the
 * same money, so it refreshes the sentence and the time and never adds a second story; a row the
 * cashier already handled stays handled.
 */
export function recordPaymentAttention(
	storeDB: StoreLocalDatabase,
	entry: Omit<PaymentAttentionEntry, 'refusedAt' | 'resolvedAt'>
) {
	return modifyAttention(storeDB, (entries) => {
		const refusedAt = new Date().toISOString();
		const existing = entries[entry.rowId];
		entries[entry.rowId] = existing
			? { ...existing, message: entry.message, refusedAt }
			: { ...entry, refusedAt, resolvedAt: null };
	});
}

/** The cashier has settled it (refunded, or taken the balance as the message said). */
export function resolvePaymentAttention(storeDB: StoreLocalDatabase, rowId: string) {
	return modifyAttention(storeDB, (entries) => {
		const entry = entries[rowId];
		if (entry && !entry.resolvedAt)
			entries[rowId] = { ...entry, resolvedAt: new Date().toISOString() };
	});
}

/** The unresolved entries, live, newest refusal first. */
export function observePaymentAttention(storeDB: StoreLocalDatabase) {
	return storeDatabase(storeDB)
		.getLocal$<Attention>(ID)
		.pipe(
			map((doc) =>
				Object.values(doc?.toJSON(true).data.entries ?? {})
					.filter((entry) => !entry.resolvedAt)
					.sort((a, b) => b.refusedAt.localeCompare(a.refusedAt))
			)
		);
}
