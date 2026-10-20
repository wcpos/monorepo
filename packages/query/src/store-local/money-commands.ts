import { map } from 'rxjs/operators';

import { ensureLocalDocument, storeDatabase } from './ensure-local-document';

import type { StoreLocalDatabase } from '../reads/store-local';

/**
 * The money command journal (ADR 0040 §1.3): every money command's frozen envelope, from before
 * it is sent until its outcome is definitive. It lives in the store database, which is named per
 * store and not per scope generation, so no order write, pull, reset or generation bump sees it.
 */
export type MoneyCommandKind =
	'record' | 'intent' | 'capture' | 'void' | 'refund' | 'submit' | 'cancel' | 'close';
export interface OrderApproval {
	readonly total: string;
	readonly currency: string;
}
export interface MoneyCommandEntry {
	readonly orderUuid: string;
	readonly kind: MoneyCommandKind;
	readonly path: string;
	/** The payment uuid, the method id, or null for record and close. */
	readonly target: string | null;
	/** The command_id, or the row id for record. */
	readonly id: string;
	/** Frozen, without command_id and revision. */
	readonly body: Readonly<Record<string, unknown>>;
	readonly approval: OrderApproval;
	/** null = never dispatched. */
	readonly sentAt: string | null;
	readonly sentRevision: string | null;
}
export interface RevisionChain {
	readonly answerRevision: string;
	readonly answeredAt: number;
	/** Set only by the post-answer refresh (§1.8). */
	readonly adoptedAfterAnswer?: boolean;
	readonly adoptedRevision?: string;
}
type OrderCommands = { entries: Record<string, MoneyCommandEntry>; chain: RevisionChain | null };
type Journal = { orders: Record<string, OrderCommands> };
const ID = 'money-commands';

async function modifyOrder(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	modify: (order: OrderCommands) => void
) {
	const doc = await ensureLocalDocument<Journal>(storeDB, ID, { orders: {} });
	await doc.incrementalModify((data) => {
		const order = (data.orders[orderUuid] ??= { entries: {}, chain: null });
		modify(order);
		if (Object.keys(order.entries).length === 0 && !order.chain) delete data.orders[orderUuid];
		return data;
	});
}

export function journalCommand(storeDB: StoreLocalDatabase, entry: MoneyCommandEntry) {
	return modifyOrder(storeDB, entry.orderUuid, (order) => {
		order.entries[entry.id] = entry;
	});
}

export function markSent(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	id: string,
	sentRevision: string
) {
	return modifyOrder(storeDB, orderUuid, (order) => {
		const entry = order.entries[id];
		if (entry) order.entries[id] = { ...entry, sentAt: new Date().toISOString(), sentRevision };
	});
}

/** Deletes the entry; a 2xx answer also records the order's revision chain. */
export function settleCommand(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	id: string | null,
	chain?: RevisionChain
) {
	return modifyOrder(storeDB, orderUuid, (order) => {
		if (id !== null) delete order.entries[id];
		if (chain) order.chain = chain;
	});
}

/** The tender's named read: the order's open commands and its revision chain. */
export async function readOrderCommands(
	storeDB: StoreLocalDatabase,
	orderUuid: string
): Promise<{ entries: MoneyCommandEntry[]; chain: RevisionChain | null }> {
	const doc = await storeDatabase(storeDB).getLocal<Journal>(ID);
	const order = doc?.toJSON(true).data.orders[orderUuid];
	return { entries: Object.values(order?.entries ?? {}), chain: order?.chain ?? null };
}

/** The same read, live: the tender gates on a sent command until it settles. */
export function observeOrderCommands(storeDB: StoreLocalDatabase, orderUuid: string) {
	return storeDatabase(storeDB)
		.getLocal$<Journal>(ID)
		.pipe(map((doc) => Object.values(doc?.toJSON(true).data.orders[orderUuid]?.entries ?? {})));
}
