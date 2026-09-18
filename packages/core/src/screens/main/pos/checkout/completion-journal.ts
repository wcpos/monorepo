import type { StoreDatabase } from '@wcpos/database';

import type { SaleOutcome } from './sale-completion';

type Attempt = {
	source: SaleOutcome['source'];
	paymentId?: string;
	at: string;
	attempts: number;
	lastError?: string;
};
type Journal = { pending: Record<string, Attempt> };
const ID = 'sale-completions';

async function journal(storeDB: StoreDatabase) {
	const existing = await storeDB.getLocal<Journal>(ID);
	if (existing) return existing;
	try {
		return await storeDB.insertLocal<Journal>(ID, { pending: {} });
	} catch (error) {
		// Another tab may have initialized it. Never replace that tab's pending work.
		const winner = await storeDB.getLocal<Journal>(ID);
		if (winner) return winner;
		throw error;
	}
}

export async function recordCompletionAttempt(
	storeDB: StoreDatabase,
	{ orderUuid, ...facts }: { orderUuid: string; source: Attempt['source']; paymentId?: string }
) {
	const doc = await journal(storeDB);
	await doc.incrementalModify((data) => {
		data.pending[orderUuid] ??= { ...facts, at: new Date().toISOString(), attempts: 0 };
		return data;
	});
}

export async function resolveCompletionAttempt(storeDB: StoreDatabase, orderUuid: string) {
	const doc = await storeDB.getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		delete data.pending[orderUuid];
		return data;
	});
}

export async function failCompletionAttempt(
	storeDB: StoreDatabase,
	orderUuid: string,
	error: unknown
) {
	const doc = await storeDB.getLocal<Journal>(ID);
	await doc?.incrementalModify((data) => {
		const entry = data.pending[orderUuid];
		if (entry) {
			entry.attempts += 1;
			entry.lastError = error instanceof Error ? error.message : String(error);
		}
		return data;
	});
}

export async function pendingCompletions(storeDB: StoreDatabase) {
	return (await storeDB.getLocal<Journal>(ID))?.toJSON(true).data.pending ?? {};
}
