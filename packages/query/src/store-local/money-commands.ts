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
	/**
	 * The engine scope (one cashier's orders) that sent the command. The journal is per store and
	 * outlives a cashier switch; the order is resident only in this scope, so the command is
	 * re-sent only while it is active. Absent on entries written before it was recorded.
	 */
	readonly scope?: string;
	/** The poster working on this command (see `claimRoute`), and when it claimed it. */
	readonly claimedBy?: string | null;
	readonly claimedAt?: number | null;
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

/**
 * How long an order's revision chain outlives its answer. Longer than any plausible lost-answer
 * retry (a till left offline over a long weekend still re-sends inside it); after that the next
 * command reads the resident's revision, and a receipt for an older completion reads the adopted
 * document, never the chain. Bounds the one journal document every money command rewrites.
 */
export const CHAIN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

async function modifyJournal(storeDB: StoreLocalDatabase, modify: (data: Journal) => void) {
	const doc = await ensureLocalDocument<Journal>(storeDB, ID, { orders: {} });
	await doc.incrementalModify((data) => {
		modify(data);
		const now = Date.now();
		for (const [uuid, order] of Object.entries(data.orders)) {
			if (order.chain && now - order.chain.answeredAt > CHAIN_RETENTION_MS) order.chain = null;
			if (Object.keys(order.entries).length === 0 && !order.chain) delete data.orders[uuid];
		}
		return data;
	});
}

function modifyOrder(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	modify: (order: OrderCommands) => void
) {
	return modifyJournal(storeDB, (data) =>
		modify((data.orders[orderUuid] ??= { entries: {}, chain: null }))
	);
}

/**
 * How long a poster's claim on a command holds against every other poster, tab and the session
 * recovery. Longer than one command's round trip with its stale re-send (seconds); short enough
 * that the claim of a tab that crashed mid-send frees its command for Try again or the recovery
 * within half a minute. A live sender renews it at each send; a settle deletes the entry with it.
 */
export const CLAIM_LEASE_MS = 30_000;

/**
 * Whether another poster holds a live claim on the entry: claimed within the lease. A claim
 * stamped in the future (the clock stepped back after it was written) is expired, not live for
 * the whole step: a lease is bounded on both sides.
 */
export function claimHeld(entry: MoneyCommandEntry, claimant: string | null, now = Date.now()) {
	const age = now - (entry.claimedAt ?? 0);
	return !!entry.claimedBy && entry.claimedBy !== claimant && age >= 0 && age < CLAIM_LEASE_MS;
}

/** A command route: its kind and target, or for `record` the row id that is its identity. */
export interface CommandRoute {
	readonly orderUuid: string;
	readonly kind: MoneyCommandKind;
	readonly target: string | null;
	readonly rowId: string | null;
}
export type RouteClaim =
	| { status: 'busy'; entry: MoneyCommandEntry }
	| { status: 'open'; entry: MoneyCommandEntry }
	| { status: 'created'; entry: MoneyCommandEntry }
	| { status: 'none' };

/**
 * Get or create the route's command and claim it, in ONE journal write. The store database's
 * local-document write serialises every writer of the journal, in this tab and every other tab
 * on the same database, so two posters for one route can never both create a command: the first
 * write creates and claims it, the second sees it. Outcomes: another live claim → `busy`; a sent
 * entry → claimed and `open` (a re-send); none (or an unsent leftover of a crash, which put
 * nothing on the server) → the `candidate` is written, claimed, as `created`; no candidate →
 * `none` (the caller freezes one and asks again).
 */
export async function claimRoute(
	storeDB: StoreLocalDatabase,
	route: CommandRoute,
	claimant: string,
	candidate: MoneyCommandEntry | null
): Promise<RouteClaim> {
	let claim: RouteClaim = { status: 'none' };
	await modifyJournal(storeDB, (data) => {
		claim = { status: 'none' };
		const now = Date.now();
		const order = (data.orders[route.orderUuid] ??= { entries: {}, chain: null });
		const same = Object.values(order.entries).filter(
			(entry) =>
				entry.kind === route.kind &&
				(route.rowId === null ? entry.target === route.target : entry.id === route.rowId)
		);
		const held = same.find((entry) => claimHeld(entry, claimant, now));
		if (held) {
			claim = { status: 'busy', entry: held };
			return;
		}
		const sent = same.find((entry) => entry.sentAt !== null);
		if (sent) {
			order.entries[sent.id] = { ...sent, claimedBy: claimant, claimedAt: now };
			claim = { status: 'open', entry: order.entries[sent.id] };
			return;
		}
		if (!candidate) return;
		for (const unsent of same) delete order.entries[unsent.id];
		order.entries[candidate.id] = { ...candidate, claimedBy: claimant, claimedAt: now };
		claim = { status: 'created', entry: order.entries[candidate.id] };
	});
	return claim;
}

/**
 * Drop a never-dispatched entry (a crash before it was sent put nothing on the server), unless a
 * live claim holds it: then a poster is still in its pre-flight and the entry is its own. The
 * check and the delete are one journal write.
 */
export function dropUnsent(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	id: string,
	claimant: string | null
) {
	return modifyOrder(storeDB, orderUuid, (order) => {
		const entry = order.entries[id];
		if (entry && entry.sentAt === null && !claimHeld(entry, claimant)) delete order.entries[id];
	});
}

/**
 * Retire a route's command outright, sent or not: its outcome is known to be "nothing happened"
 * from another answer (a locked intent whose cancel then found no row to void), so it must never
 * be re-sent.
 */
export function retireRoute(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	kind: MoneyCommandKind,
	target: string | null
) {
	return modifyOrder(storeDB, orderUuid, (order) => {
		for (const entry of Object.values(order.entries))
			if (entry.kind === kind && entry.target === target) delete order.entries[entry.id];
	});
}

/** Give the claim up, keeping the entry: another poster, Try again or the recovery may send it. */
export function releaseClaim(
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	id: string,
	claimant: string
) {
	return modifyOrder(storeDB, orderUuid, (order) => {
		const entry = order.entries[id];
		if (entry?.claimedBy === claimant)
			order.entries[id] = { ...entry, claimedBy: null, claimedAt: null };
	});
}

/**
 * Retire a settled order's chain: no entry is open and the caller saw a later adoption move the
 * resident past it, so it neither picks a revision nor guards a receipt any more. A chain an
 * answer replaced meanwhile (another `answeredAt`) is kept.
 */
export function retireChain(storeDB: StoreLocalDatabase, orderUuid: string, answeredAt: number) {
	return modifyJournal(storeDB, (data) => {
		const order = data.orders[orderUuid];
		if (order && Object.keys(order.entries).length === 0 && order.chain?.answeredAt === answeredAt)
			order.chain = null;
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
		// A send renews its sender's claim (`CLAIM_LEASE_MS`).
		if (entry)
			order.entries[id] = {
				...entry,
				sentAt: new Date().toISOString(),
				sentRevision,
				...(entry.claimedBy ? { claimedAt: Date.now() } : {}),
			};
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

/** Every journaled order: the store-session recovery re-sends what was sent and never answered. */
export async function readMoneyJournal(
	storeDB: StoreLocalDatabase
): Promise<Record<string, { entries: MoneyCommandEntry[]; chain: RevisionChain | null }>> {
	const doc = await storeDatabase(storeDB).getLocal<Journal>(ID);
	return Object.fromEntries(
		Object.entries(doc?.toJSON(true).data.orders ?? {}).map(([uuid, order]) => [
			uuid,
			{ entries: Object.values(order.entries), chain: order.chain },
		])
	);
}

/**
 * When the earliest live claim on a sent, unanswered command lapses, or null when none holds one.
 * The recovery skips a claimed command, so the session runs it again at this time: a claim a
 * crashed process left behind must not keep its command unanswered while the till stays online.
 */
export async function nextClaimExpiry(storeDB: StoreLocalDatabase, now = Date.now()) {
	let next: number | null = null;
	for (const { entries } of Object.values(await readMoneyJournal(storeDB)))
		for (const entry of entries)
			if (entry.sentAt !== null && claimHeld(entry, null, now)) {
				const expiry = (entry.claimedAt ?? 0) + CLAIM_LEASE_MS;
				if (next === null || expiry < next) next = expiry;
			}
	return next;
}

/** The same read, live: the tender gates on a sent command until it settles. */
export function observeOrderCommands(storeDB: StoreLocalDatabase, orderUuid: string) {
	return storeDatabase(storeDB)
		.getLocal$<Journal>(ID)
		.pipe(map((doc) => Object.values(doc?.toJSON(true).data.orders[orderUuid]?.entries ?? {})));
}
