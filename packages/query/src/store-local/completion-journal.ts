import { map } from 'rxjs/operators';

import { ensureLocalDocument, storeDatabase } from './ensure-local-document';

import type { StoreLocalDatabase } from '../reads/store-local';

type Attempt = {
	source:
		| 'manual'
		| 'terminal'
		| 'gateway'
		| 'gateway-settled'
		| 'gateway-contract'
		| 'gateway-snapshot'
		| 'zero-balance'
		| 'replay';
	paymentId?: string;
	at: string;
	missingStarts?: number;
	unpaidStarts?: number;
	actor?: { id: string; name: string };
	/**
	 * The POS Order Status the merchant stored for a gateway attempt's gateway, so replay
	 * settles the order as the pay window would (sale-completion isSettledOrderStatus).
	 */
	settledOrderStatus?: string | null;
	settledOrderGateway?: string;
	/**
	 * A legacy pay-page attempt journals every gateway's stored status, keyed by id: the
	 * pay page can settle through any POS gateway, so replay looks up the gateway the
	 * resident order carries, not the one the sale was opened with.
	 */
	settledOrderStatuses?: Record<string, string | null>;
	/**
	 * The store took the sale but no refresh confirmed the resident (`unconfirmed`): the store
	 * session finishes it once a pull adopts the paid order. Its own field, so a later replay's
	 * error cannot clear it (Codex 4344119710 on #2836); it ends with the attempt.
	 */
	awaitingAdoption?: true;
};
type Journal = { pending: Record<string, Attempt> };
const ID = 'sale-completions';
/** The third counted start of one kind abandons the attempt (decided 2026-09-18, 0d2f07f29a). */
const COMPLETION_START_LIMIT = 3;

export async function recordCompletionAttempt(
	storeDB: StoreLocalDatabase,
	{
		orderUuid,
		...facts
	}: { orderUuid: string } & Pick<
		Attempt,
		| 'source'
		| 'paymentId'
		| 'actor'
		| 'settledOrderStatus'
		| 'settledOrderGateway'
		| 'settledOrderStatuses'
	>
) {
	const doc = await ensureLocalDocument<Journal>(storeDB, ID, { pending: {} });
	await doc.incrementalModify((data) => {
		data.pending[orderUuid] = { ...facts, at: new Date().toISOString() };
		return data;
	});
}

export async function resolveCompletionAttempt(storeDB: StoreLocalDatabase, orderUuid: string) {
	const doc = await storeDatabase(storeDB).getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		delete data.pending[orderUuid];
		return data;
	});
}

export type CountedStart = 'kept' | 'abandoned';

/**
 * One replay start that could not finish the attempt read at `at`: counted, and abandoned on the
 * third of its kind (a cancelled order at once), in ONE serialised write. A replaced or missing
 * entry is 'kept', untouched.
 */
export async function countCompletionStart(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	{ at, start }: { at: string; start: 'missing' | 'unpaid' | 'cancelled' }
): Promise<CountedStart> {
	let counted: CountedStart = 'kept';
	const doc = await storeDatabase(storeDB).getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		counted = 'kept'; // incrementalModify may retry the callback
		if (!Object.hasOwn(data.pending, orderUuid)) return data; // never a prototype key
		const entry = data.pending[orderUuid];
		if (entry?.at !== at) return data;
		if (start !== 'cancelled') {
			const field = start === 'missing' ? 'missingStarts' : 'unpaidStarts';
			const starts = (entry[field] ?? 0) + 1;
			entry[field] = starts;
			if (starts < COMPLETION_START_LIMIT) return data;
		}
		delete data.pending[orderUuid];
		counted = 'abandoned';
		return data;
	});
	return counted;
}

/**
 * The store answered the sale paid but no refresh confirmed the resident: the attempt awaits the
 * pull that adopts the paid order, and the bridge finishes it then. The one place this state is
 * written, for a close at the till (`unconfirmed`) and a recovered answer alike. Never creates.
 */
export async function awaitAdoption(storeDB: StoreLocalDatabase, orderUuid: string) {
	const doc = await storeDatabase(storeDB).getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		const entry = data.pending[orderUuid];
		if (entry) entry.awaitingAdoption = true;
		return data;
	});
}

/** A finish threw: the attempt stays, created from `facts` if the throw came before it was recorded. */
export async function retainCompletionAttempt(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	facts: Pick<Attempt, 'source' | 'actor'>
) {
	const doc = await ensureLocalDocument<Journal>(storeDB, ID, { pending: {} });
	await doc.incrementalModify((data) => {
		data.pending[orderUuid] ??= { ...facts, at: new Date().toISOString() };
		return data;
	});
}

export async function pendingCompletions(storeDB: StoreLocalDatabase) {
	return (await storeDatabase(storeDB).getLocal<Journal>(ID))?.toJSON(true).data.pending ?? {};
}

/** The pending completions, live: the store session finishes an unconfirmed one once it reads paid. */
export function observePendingCompletions(storeDB: StoreLocalDatabase) {
	return storeDatabase(storeDB)
		.getLocal$<Journal>(ID)
		.pipe(map((doc) => doc?.toJSON(true).data.pending ?? {}));
}
