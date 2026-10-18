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
	attempts: number;
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
	lastError?: string;
};
type Journal = { pending: Record<string, Attempt> };
const ID = 'sale-completions';

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
		data.pending[orderUuid] = { ...facts, at: new Date().toISOString(), attempts: 0 };
		return data;
	});
}

export async function resolveCompletionAttempt(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	expectAt?: string
) {
	const doc = await storeDatabase(storeDB).getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		if (expectAt !== undefined && data.pending[orderUuid]?.at !== expectAt) return data;
		delete data.pending[orderUuid];
		return data;
	});
}

export async function failCompletionAttempt(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	error: unknown,
	options: {
		expectAt?: string;
		missingStart?: boolean;
		unpaidStart?: boolean;
		facts?: Pick<Attempt, 'source' | 'actor'>;
	} = {}
) {
	const doc = options.facts
		? await ensureLocalDocument<Journal>(storeDB, ID, { pending: {} })
		: await storeDatabase(storeDB).getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		if (options.expectAt !== undefined && data.pending[orderUuid]?.at !== options.expectAt)
			return data;
		if (options.facts)
			data.pending[orderUuid] ??= { ...options.facts, at: new Date().toISOString(), attempts: 0 };
		const entry = data.pending[orderUuid];
		if (entry) {
			entry.attempts += 1;
			if (options.missingStart) entry.missingStarts = (entry.missingStarts ?? 0) + 1;
			if (options.unpaidStart) entry.unpaidStarts = (entry.unpaidStarts ?? 0) + 1;
			entry.lastError = error instanceof Error ? error.message : String(error);
		}
		return data;
	});
}

export async function pendingCompletions(storeDB: StoreLocalDatabase) {
	return (await storeDatabase(storeDB).getLocal<Journal>(ID))?.toJSON(true).data.pending ?? {};
}
