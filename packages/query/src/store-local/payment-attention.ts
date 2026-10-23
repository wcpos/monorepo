import { map } from 'rxjs/operators';

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
	/** The store's id, to bring the order in when it is not on this device. */
	readonly orderId: number | null;
	/** The cashier-readable sentence the refusal was logged with. */
	readonly message: string;
	readonly refusedAt: string;
}
type Attention = { entries: Record<string, PaymentAttentionEntry> };
const ID = 'payment-attention';

async function modifyAttention(
	storeDB: StoreLocalDatabase,
	modify: (entries: Record<string, PaymentAttentionEntry>) => void
) {
	const doc = await ensureLocalDocument<Attention>(storeDB, ID, { entries: {} });
	await doc.incrementalModify((data) => {
		modify(data.entries);
		return data;
	});
}

/** Raise the row's entry; keyed by row id, so a repeat refusal of the row replaces it. */
export function recordPaymentAttention(
	storeDB: StoreLocalDatabase,
	entry: Omit<PaymentAttentionEntry, 'refusedAt'>
) {
	return modifyAttention(storeDB, (entries) => {
		entries[entry.rowId] = { ...entry, refusedAt: new Date().toISOString() };
	});
}

/**
 * The cashier has settled it (refunded, or taken the balance as the message said): the entry is
 * deleted. A refusal settles the row's journal entry, so the same row is practically refused once;
 * if it ever recurs, that is new information and may raise the entry again.
 */
export function resolvePaymentAttention(storeDB: StoreLocalDatabase, rowId: string) {
	return modifyAttention(storeDB, (entries) => {
		delete entries[rowId];
	});
}

/** The entries, live, newest refusal first. */
export function observePaymentAttention(storeDB: StoreLocalDatabase) {
	return storeDatabase(storeDB)
		.getLocal$<Attention>(ID)
		.pipe(
			map((doc) =>
				Object.values(doc?.toJSON(true).data.entries ?? {}).sort((a, b) =>
					b.refusedAt.localeCompare(a.refusedAt)
				)
			)
		);
}
