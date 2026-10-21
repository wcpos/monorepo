import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import {
	isDefinitiveMoneyRefusal,
	isMoneyAnswer,
	MONEY_ANSWER_CODES,
	moneyRefusalOf,
} from '@wcpos/sync-core';

import { mirrorMoneyAnswer } from '../mutations/mirror-server-order';
import { pushRecord } from '../mutations/push-record';
import { findEngineResident } from '../mutations/resident';
import { refreshRecordByWooId } from '../record-readers/refresh-records';
import {
	dropUnsent,
	markSent,
	type MoneyCommandEntry,
	type MoneyCommandKind,
	type OrderApproval,
	readOrderCommands,
	type RevisionChain,
	settleCommand,
} from '../store-local/money-commands';

import type { QueryRuntime } from '../provider';
import type { StoreLocalDatabase } from '../reads/store-local';

/**
 * The money command envelope (ADR 0040 §1.3, rules 5 and 6a). Every money command carries the
 * order's `revision` and, except `record` (whose id is its row id), a `command_id`; its frozen
 * envelope is journaled before anything else, and a retry is always a re-send of that frozen
 * body under its own id, which the server replays. There is no resolution by reading.
 */
export type Post = (url: string, body: unknown) => Promise<{ data: unknown }>;
/**
 * Why a command ended before (or without) an answer that settles it. `preflight_failed`: the
 * pre-flight itself failed (the push of pending work was refused, the resident could not be
 * read), so nothing left the till; the original failure is the `cause`.
 */
export type MoneyCommandErrorReason =
	'revision_unavailable' | 'order_changed' | 'preflight_failed' | 'in_flight';
export class MoneyCommandError extends Error {
	public constructor(
		public readonly reason: MoneyCommandErrorReason,
		public readonly entry: MoneyCommandEntry,
		public readonly order?: OrderPaymentSummary,
		options?: { cause?: unknown }
	) {
		super(`money_command_${reason}`, options);
		this.name = 'MoneyCommandError';
	}
}

/** The cashier's approval is re-checked for the commands that move money on a total. */
const APPROVED_KINDS = new Set<MoneyCommandKind>(['intent', 'submit', 'close']);
/** End a payment in motion: a pending edit is refused until they land, so they never push it. */
const ENDS_MOTION = new Set<MoneyCommandKind>(['capture', 'void', 'cancel']);
const ROUTE =
	/^orders\/(\d+)\/(?:payments(?:\/([^/]+)\/(intent|capture|void|refund))?|payment-methods\/([^/]+)\/(submit|cancel)|(close))$/;

function classifyMoneyRoute(
	path: string
): { kind: MoneyCommandKind; orderId: number; target: string | null } | null {
	const match = ROUTE.exec(path.replace(/^\/+/, ''));
	if (!match) return null;
	const kind = (match[3] ?? match[5] ?? match[6] ?? 'record') as MoneyCommandKind;
	return { kind, orderId: Number(match[1]), target: match[2] ?? match[4] ?? null };
}

type ResidentOrder = {
	payload: { id?: number; total?: unknown; currency?: unknown };
	sync: { revision?: string; adopted?: { revision?: string; at?: number } };
	local: { dirty?: boolean; pendingMutationIds?: string[] };
};
async function readOrder(runtime: QueryRuntime, orderUuid: string) {
	const resident = await findEngineResident(runtime, 'orders', orderUuid);
	if (!resident) throw new Error(`Engine resident "${orderUuid}" is missing from "orders"`);
	return { resident, order: resident.getLatest().toJSON() as unknown as ResidentOrder };
}

/** A document adopted whole, under the revision it carries, after the chain's last answer. */
function holdsAuthority(order: ResidentOrder, chain: RevisionChain | null): boolean {
	const { revision, adopted } = order.sync ?? {};
	return (
		!!revision && adopted?.revision === revision && (!chain || (adopted.at ?? 0) > chain.answeredAt)
	);
}

function approvalHolds(approval: OrderApproval, order: { total?: unknown; currency?: unknown }) {
	return (
		Number(order.total) === Number(approval.total) && String(order.currency) === approval.currency
	);
}

/** The corrective refresh: re-adopts the document even under an equal stamp. */
async function readopt(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	orderId: number
): Promise<{ order: ResidentOrder; chain: RevisionChain | null; refreshAdopted: boolean }> {
	const prior = await readOrder(runtime, orderUuid);
	const before = prior.order.sync?.adopted;
	const priorWrite = (prior.resident.getLatest() as { revision?: string }).revision;
	const refreshed = await refreshRecordByWooId(runtime.engine, {
		id: `money-command:readopt:${orderId}`,
		collection: 'orders',
		wooId: orderId,
		readopt: true,
	}).then(
		() => true,
		() => false
	);
	const { resident, order } = await readOrder(runtime, orderUuid);
	const { chain } = await readOrderCommands(storeDB, orderUuid);
	const adopted = order.sync?.adopted;
	// This refresh adopted: it succeeded and a whole document under its own stamp was written since
	// it began. Never an older read landing while it failed, nor time alone (a pull in the same
	// millisecond is indistinguishable by its stamp).
	const whole = refreshed && !!adopted && adopted.revision === order.sync.revision;
	const adoptedNow = whole && (adopted.at !== before?.at || adopted.revision !== before?.revision);
	const refreshAdopted =
		adoptedNow ||
		(whole && (resident.getLatest() as { revision?: string }).revision !== priorWrite);
	// A clock step back dates the answer ahead of this adoption (as a claim, 926d62a59c).
	if (!chain || !adoptedNow || (adopted.at ?? 0) > chain.answeredAt)
		return { order, chain, refreshAdopted };
	const recorded = { ...chain, answeredAt: (adopted.at ?? 0) - 1 };
	await settleCommand(storeDB, orderUuid, null, recorded);
	return { order, chain: recorded, refreshAdopted };
}

/** Pre-flight: push pending local work, choose the revision, re-check the approval. */
async function chooseRevision(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	entry: MoneyCommandEntry,
	orderId: number,
	fresh: boolean
): Promise<string> {
	let { resident, order } = await readOrder(runtime, entry.orderUuid);
	const pending = order.local?.dirty || (order.local?.pendingMutationIds?.length ?? 0) > 0;
	if (fresh && pending && !ENDS_MOTION.has(entry.kind)) {
		await pushRecord(runtime, resident as never);
		({ resident, order } = await readOrder(runtime, entry.orderUuid));
	}
	let { chain } = await readOrderCommands(storeDB, entry.orderUuid);
	// A re-send reaches here only without a sent revision of its own (see sendMoneyCommand).
	const approved = APPROVED_KINDS.has(entry.kind);
	if (!holdsAuthority(order, chain)) {
		({ order, chain } = await readopt(runtime, storeDB, entry.orderUuid, orderId));
		if (approved && !holdsAuthority(order, chain))
			throw new MoneyCommandError('revision_unavailable', entry);
	}
	const revision = holdsAuthority(order, chain)
		? order.sync.revision
		: (chain?.answerRevision ?? order.sync?.revision);
	if (!revision) throw new MoneyCommandError('revision_unavailable', entry);
	if (approved && !approvalHolds(entry.approval, order.payload))
		throw new MoneyCommandError('order_changed', entry);
	return revision;
}

/**
 * Send (or re-send) a journaled command. A never-dispatched entry that is refused locally is
 * deleted: nothing left the till. From `markSent` on, only a definitive answer deletes it.
 */
export async function sendMoneyCommand(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	entry: MoneyCommandEntry,
	deps: { post: Post }
): Promise<{ data: Record<string, unknown> & { revision?: string }; sentRevision: string }> {
	const route = classifyMoneyRoute(entry.path);
	if (!route)
		throw new MoneyCommandError('preflight_failed', entry, undefined, {
			cause: new Error(`Not a money command route: "${entry.path}"`),
		});
	const fresh = entry.sentAt === null;
	// A re-send of an approved command goes out under the revision it was first sent with. The
	// server checks the replay before the revision, so a stored command replays; one it never
	// stored is refused as stale, and the stale path re-checks the approval against the document
	// it adopts before it re-sends once. A re-send never borrows a newer revision the cashier did
	// not approve against: a remote reopen, then a restart, must not close the reopened sale.
	let revision: string;
	if (!fresh && APPROVED_KINDS.has(entry.kind) && entry.sentRevision) {
		// Local edits made since the first send go to the store first, under their own push: if the
		// store never stored this command, its revision has then moved, the re-send is answered
		// stale, and the stale path re-checks the approval against the edited order. A stored
		// command replays before the revision is checked, so pushing first costs it nothing. A
		// push that fails leaves the command journaled, unsent this time.
		const { resident, order } = await readOrder(runtime, entry.orderUuid);
		if (order.local?.dirty || (order.local?.pendingMutationIds?.length ?? 0) > 0)
			await pushRecord(runtime, resident as never);
		revision = entry.sentRevision;
	} else
		try {
			revision = await chooseRevision(runtime, storeDB, entry, route.orderId, fresh);
		} catch (error) {
			if (!fresh) throw error;
			// Never dispatched: nothing can be on the server, so the outcome is terminal and typed.
			// Only this sender's own entry goes: a poster that replaced it after the lease keeps its.
			await dropUnsent(storeDB, entry.orderUuid, entry.id, entry.claimedBy ?? null);
			throw error instanceof MoneyCommandError
				? error
				: new MoneyCommandError('preflight_failed', entry, undefined, { cause: error });
		}
	let refusal: unknown = null;
	for (let stale = false; ; stale = true) {
		// Fenced on this sender's claim: a sender another poster displaced never posts.
		if (!(await markSent(storeDB, entry.orderUuid, entry.id, revision, entry.claimedBy ?? null)))
			throw new MoneyCommandError('in_flight', entry);
		try {
			const command = entry.kind === 'record' ? {} : { command_id: entry.id };
			const { data } = await deps.post(entry.path, { ...entry.body, ...command, revision });
			// Only the store's own answer for the kind (sync-core `isMoneyAnswer`), about THIS
			// command, answers it (Codex 4332722141, 4333265118 on #2798). A proxy page, a filter's
			// `{}` or another payment's row proves nothing: the entry stays for a re-send.
			if (
				!isMoneyAnswer(entry.kind, data) ||
				!answersCommand(entry, data as Record<string, unknown>)
			)
				throw new Error(
					entry.kind === 'close' ? 'close_malformed_response' : 'money_command_malformed_answer'
				);
			return { data: data as Record<string, unknown>, sentRevision: revision };
		} catch (error) {
			const failure = moneyRefusalOf(error);
			const stalled = failure?.code === MONEY_ANSWER_CODES.revisionStale && !stale;
			// A sender whose lease lapsed while its answer was on the way, and whose command another
			// poster has claimed since, leaves it to that poster: no adoption, re-send or settle.
			const claimant = entry.claimedBy ?? null;
			const held = async () =>
				(await readOrderCommands(storeDB, entry.orderUuid)).entries.some(
					({ id, claimedBy }) => id === entry.id && (claimedBy ?? null) === claimant
				);
			if ((stalled || isDefinitiveMoneyRefusal(failure)) && !(await held()))
				throw new MoneyCommandError('in_flight', entry);
			// A gateway's 502 is ambiguous: the store answers the same after a gateway that threw past
			// dispatch, its attempt left `sent`. Re-sent once, a stored `sent` replays; a refused attempt
			// is answered `wcpos_payment_conflict`, and the gateway's own refusal then stands.
			if (failure?.code === 'wcpos_provider_error' && entry.kind === 'submit' && !stale) {
				refusal = error;
				continue;
			}
			if (stalled) {
				const current = failure.data?.current as Record<string, unknown> | undefined;
				const currentRevision = failure.data?.currentRevision;
				const adopted = current
					? await runtime.engine.adoptOrderSnapshot({ ...current, _rxdb_revision: currentRevision })
					: 'invalid';
				// The server stored nothing for a stale fresh command: a changed order is re-approved.
				if (
					APPROVED_KINDS.has(entry.kind) &&
					(adopted !== 'applied' || !approvalHolds(entry.approval, current!))
				) {
					await settleCommand(storeDB, entry.orderUuid, entry.id, undefined, claimant);
					throw new MoneyCommandError(
						'order_changed',
						entry,
						failure.data?.order as OrderPaymentSummary
					);
				}
				if (typeof currentRevision !== 'string') throw error;
				revision = currentRevision;
				continue;
			}
			// Every named 4xx refusal is the server's decision (sync-core's money answer rule).
			if (isDefinitiveMoneyRefusal(failure)) {
				const payment = failure?.data?.payment as PaymentRow | undefined;
				if (payment)
					await mirrorMoneyAnswer(runtime, entry.orderUuid, { payment, sentRevision: revision });
				await settleCommand(storeDB, entry.orderUuid, entry.id, undefined, claimant);
				throw refusal ?? error;
			}
			throw error;
		}
	}
}

/**
 * The forced refresh after the mirror. When it adopts the document whole, the chain records
 * that the resident now holds a post-answer read (the receipt's barrier, §1.8).
 */
export async function settleMoneyCommand(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string
): Promise<void> {
	const { order } = await readOrder(runtime, orderUuid);
	// An order the store has not created has no revision and no chain: nothing to settle.
	if (!order.payload.id) return;
	const read = await readopt(runtime, storeDB, orderUuid, order.payload.id);
	if (read.chain && read.refreshAdopted && holdsAuthority(read.order, read.chain))
		await settleCommand(storeDB, orderUuid, null, {
			...read.chain,
			adoptedAfterAnswer: true,
			adoptedRevision: read.order.sync.revision,
		});
}

/**
 * Whether a well-formed answer is about THIS command: the row it carries is the record's own
 * row, the leg the route names, or, for a recorded submit, the submitted attempt (whose id the
 * row takes). A proxy, a filter or a wrong handler answering with another payment's row never
 * settles the command, so its retry is never lost.
 */
function answersCommand(entry: MoneyCommandEntry, data: Record<string, unknown>): boolean {
	// The store lowercases the ids it is given (`strtolower` on route uuids and attempt ids).
	const row = (data.payment as { id?: unknown } | null | undefined)?.id;
	const is = (id: unknown) =>
		typeof row === 'string' && typeof id === 'string' && row.toLowerCase() === id.toLowerCase();
	switch (entry.kind) {
		case 'record':
			return is(entry.id);
		case 'intent':
		case 'capture':
		case 'void':
		case 'refund':
			return is(entry.target);
		case 'submit':
			return data.outcome !== 'recorded' || is(entry.body.attempt_id);
		default:
			return true;
	}
}
