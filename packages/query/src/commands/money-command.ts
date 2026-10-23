import { type OrderPaymentSummary, type PaymentRow, samePaymentId } from '@wcpos/order-math';
import {
	isDefinitiveMoneyRefusal,
	isMoneyAnswer,
	MONEY_ANSWER_CODES,
	moneyRefusalOf,
} from '@wcpos/sync-core';
import { residentRevision } from '@wcpos/sync-engine';

import { mintUuid } from '../mint-uuid';
import { mirrorMoneyAnswer, type MoneyAnswer } from '../mutations/money-answer';
import { pushRecord } from '../mutations/push-record';
import { findEngineResident } from '../mutations/resident';
import { refreshRecordByWooId } from '../record-readers/refresh-records';
import {
	claimRoute,
	classifyMoneyRoute,
	type CommandPhase,
	commandState,
	deferEntry,
	dropLeftovers,
	dropUnsent,
	isDeferred,
	markSent,
	type MoneyCommandEntry,
	type MoneyCommandKind,
	type OrderApproval,
	phaseOf,
	readMoneyJournal,
	readOrderCommands,
	releaseClaim,
	retireChain,
	retireRoute,
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
export interface CommandProvenance {
	register_id?: string;
	session_id?: string;
	sale_time?: string;
	sale_tz?: string;
	sale_counter?: string;
}
/** The command a provenance is frozen for: whether it completes the sale decides the counter. */
export interface ProvenanceCommand {
	readonly kind: MoneyCommandKind;
	readonly target: string | null;
	readonly body: Readonly<Record<string, unknown>>;
}
/**
 * Why a command ended before (or without) an answer that settles it. `preflight_failed`: the
 * pre-flight itself failed (the push of pending work was refused, the resident could not be
 * read), so nothing left the till; the original failure is the `cause`.
 */
export type MoneyCommandErrorReason =
	'revision_unavailable' | 'order_changed' | 'preflight_failed' | 'in_flight';
export class MoneyCommandError extends Error {
	/** The phase before this send: `unsent` = the store holds nothing from it. */
	public readonly phase: CommandPhase;
	public constructor(
		public readonly reason: MoneyCommandErrorReason,
		entry: MoneyCommandEntry,
		public readonly order?: OrderPaymentSummary,
		options?: { cause?: unknown }
	) {
		super(`money_command_${reason}`, options);
		this.name = 'MoneyCommandError';
		this.phase = phaseOf(entry);
	}
}
export type MoneyCommandPoster = Post & {
	/**
	 * Mirror an answer onto the LATEST resident under the revision the last command was sent
	 * with (the summary's status lands only while the resident still carries it), then settle:
	 * delete the answered entries and run the forced refresh. A status poll's `revision` is
	 * recorded as the order's chain, without the refresh, so the next command is sent under it.
	 */
	mirror(answer: Omit<MoneyAnswer, 'sentRevision'> & { revision?: unknown }): Promise<void>;
	/**
	 * Delete the answered entries, then the forced refresh (what `mirror` ends with). A definitive
	 * refusal since the last settle also earns the refresh, never an answer chain.
	 */
	settle(): Promise<void>;
	/** Give up the answered entries' claims without settling them: they stay for a re-send. */
	abandon(): Promise<void>;
	/** Journal a record frozen, sent-undispatched, for the recovery (ADR 0040 D1); idempotent by row. */
	defer(url: string, body: unknown): Promise<MoneyCommandEntry>;
	/**
	 * Retire the order's command for a route, unanswered, because another answer proved it never
	 * ran (a locked intent whose cancel's void found no row, or voided it): never re-send it.
	 */
	retire(kind: MoneyCommandKind, target: string | null): Promise<void>;
};

/** The cashier's approval is re-checked for the commands that move money on a total. */
const APPROVED_KINDS = new Set<MoneyCommandKind>(['intent', 'submit', 'close']);
/** End a payment in motion: a pending edit is refused until they land, so they never push it. */
const ENDS_MOTION = new Set<MoneyCommandKind>(['capture', 'void', 'cancel']);
/**
 * The kinds whose body carries the till's provenance: the store wraps exactly these five handlers
 * in its provenance context (`Payments_Controller`, `Completion_Stamp::with_provenance`).
 */
const PROVENANCE_KINDS = new Set<MoneyCommandKind>([
	'record',
	'intent',
	'capture',
	'submit',
	'close',
]);
type ResidentOrder = {
	payload: { id?: number; total?: unknown; currency?: unknown };
	sync: unknown;
	local: { dirty?: boolean; pendingMutationIds?: string[] };
};
async function readOrder(runtime: QueryRuntime, orderUuid: string) {
	const resident = await findEngineResident(runtime, 'orders', orderUuid);
	if (!resident) throw new Error(`Engine resident "${orderUuid}" is missing from "orders"`);
	return { resident, order: resident.getLatest().toJSON() as unknown as ResidentOrder };
}

/** A document adopted whole, under the revision it carries, after the chain's last answer. */
function holdsAuthority(order: ResidentOrder, chain: RevisionChain | null): boolean {
	return residentRevision(order).holdsDocument(chain ? chain.answeredAt : undefined);
}

/**
 * The receipt's barrier (§1.8) as a named read: the resident holds a whole document adopted
 * after the order's last answer. A paid status the mirror copied is not one (Codex 4345589089 on
 * #2836).
 */
export async function residentHoldsAnswer(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string
): Promise<boolean> {
	const { order } = await readOrder(runtime, orderUuid);
	return holdsAuthority(order, (await readOrderCommands(storeDB, orderUuid)).chain);
}

/** The order's answers are adopted: no command is open and the resident holds the last answer. */
export async function answerAdopted(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string
): Promise<boolean> {
	return (
		(await readOrderCommands(storeDB, orderUuid)).entries.length === 0 &&
		(await residentHoldsAnswer(runtime, storeDB, orderUuid))
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
	const before = residentRevision(prior.order).adopted;
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
	const { revision, adopted } = residentRevision(order);
	// This refresh adopted: it succeeded and a whole document under its own stamp was written since
	// it began. Never an older read landing while it failed, nor time alone (a pull in the same
	// millisecond is indistinguishable by its stamp).
	const whole = refreshed && !!adopted && adopted.revision === revision;
	const adoptedNow = whole && (adopted.at !== before?.at || adopted.revision !== before?.revision);
	const refreshAdopted =
		adoptedNow ||
		(whole && (resident.getLatest() as { revision?: string }).revision !== priorWrite);
	// A clock step back dates the answer ahead of this adoption (as a claim, 926d62a59c).
	if (!chain || !adoptedNow || adopted.at > chain.answeredAt)
		return { order, chain, refreshAdopted };
	const recorded = { ...chain, answeredAt: adopted.at - 1 };
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
	// A deferred record was journaled offline: the edits made before it (its provenance stamp)
	// reach the store before it, as a fresh command's would.
	if ((fresh || isDeferred(entry)) && pending && !ENDS_MOTION.has(entry.kind)) {
		await pushRecord(runtime, resident as never);
		({ resident, order } = await readOrder(runtime, entry.orderUuid));
	}
	let { chain } = await readOrderCommands(storeDB, entry.orderUuid);
	// A re-send reaches here only without a sent revision of its own (see sendMoneyCommand).
	const approved = APPROVED_KINDS.has(entry.kind);
	// A poll's chain newer than the last whole adoption names the store's revision after the poll
	// settled the row: a void, capture or cancel goes out under it without a re-read (the refused
	// 409 and its re-send are what the poll's revision removes). An approved kind still re-adopts,
	// so its approval is checked against a fresh document.
	const polled = !!chain?.polled && (residentRevision(order).adopted?.at ?? 0) <= chain.answeredAt;
	if (!holdsAuthority(order, chain) && (approved || !polled)) {
		({ order, chain } = await readopt(runtime, storeDB, entry.orderUuid, orderId));
		if (approved && !holdsAuthority(order, chain))
			throw new MoneyCommandError('revision_unavailable', entry);
	}
	const current = residentRevision(order).revision;
	const revision = holdsAuthority(order, chain) ? current : (chain?.answerRevision ?? current);
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
	const fresh = phaseOf(entry) === 'unsent';
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
			adoptedRevision: residentRevision(read.order).revision,
		});
}

/**
 * Whether a well-formed answer is about THIS command: the row it carries is the record's own
 * row, the leg the route names, or, for a recorded submit, the submitted attempt (whose id the
 * row takes). A proxy, a filter or a wrong handler answering with another payment's row never
 * settles the command, so its retry is never lost.
 */
function answersCommand(entry: MoneyCommandEntry, data: Record<string, unknown>): boolean {
	const row = (data.payment as { id?: unknown } | null | undefined)?.id;
	const is = (id: unknown) =>
		typeof row === 'string' && typeof id === 'string' && samePaymentId(row, id);
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

/** Whether a forced refresh, run now (after the answer), itself adopts the order's document. */
async function refreshAdopts(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string
): Promise<boolean> {
	const { order } = await readOrder(runtime, orderUuid);
	if (!order.payload.id) return false;
	return (await readopt(runtime, storeDB, orderUuid, order.payload.id)).refreshAdopted;
}

/** The engine scope the till is in now: one cashier's orders. */
async function activeScopeId(runtime: QueryRuntime): Promise<string> {
	return (runtime.engine.active() ?? (await runtime.engine.whenActive())).scopeId;
}
/**
 * A command is re-sent only in the scope that sent it (Codex 4333124076, 4333445290 on #2798):
 * another cashier's order is not resident here.
 */
function inScope(entry: MoneyCommandEntry, scope: string) {
	return entry.scope === scope;
}

/** A re-sent command and the store's 2xx answer to it. */
export interface ResentCommand {
	readonly kind: MoneyCommandKind;
	readonly data: Record<string, unknown>;
}

/**
 * Try again: re-send every dispatched command of the order through a replaying poster (the same
 * entry, id and frozen body), mirror each answer and settle it; a never-sent one is dropped.
 * Returns the answers, so the caller finishes the sale from them as from a first answer.
 */
export async function resendOpenCommands(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	deps: { post: Post }
): Promise<ResentCommand[]> {
	const scope = await activeScopeId(runtime);
	const entries = (await readOrderCommands(storeDB, orderUuid)).entries.filter((entry) =>
		inScope(entry, scope)
	);
	const poster = moneyCommandPoster({ runtime, storeDB, orderUuid, post: deps.post, replay: true });
	const answers: ResentCommand[] = [];
	// A crash leftover put nothing on the server. One a live poster holds is its pre-flight's,
	// and stays (CodeRabbit 4332935302 on #2798).
	await dropLeftovers(storeDB, orderUuid, scope, entries);
	for (const entry of entries) {
		if (phaseOf(entry) === 'unsent') continue;
		const sent = await poster(entry.path, entry.body).catch(async (error: Error) => {
			if (error.message === 'money_command_unclaimed') return null;
			// A definitive refusal settled its entry and says the resident's money is stale: the
			// poster's settle runs the corrective refresh before the refusal propagates (Codex
			// 4342609024 on #2831). The refusal is what the caller acts on, so a refresh that fails
			// leaves the resident to the next adoption instead of replacing it.
			await poster.settle().catch(() => undefined);
			throw error;
		});
		// Settled since the snapshot by its own sender: nothing to replay (adversarial 2 on #2798).
		if (!sent) continue;
		const { data } = sent as { data: Record<string, unknown> };
		// A replayed submit or cancel cannot carry the awaiting-customer stamp its first answer wrote
		// or cleared (the stamp needs the press's destination and cashier); only the store's document
		// does (Codex 4333124084 on #2798). So it settles only once the refresh run after the answer
		// has adopted that document: a pull adopted while the re-send was in flight, or in the
		// answer's own millisecond, does not count. A resident with a gateway's `pending` status and
		// no stamp would read as a settled sale.
		if (
			(entry.kind === 'submit' || entry.kind === 'cancel') &&
			!(await refreshAdopts(runtime, storeDB, orderUuid))
		) {
			await poster.abandon();
			throw new Error('money_command_unconfirmed');
		}
		await poster.mirror({
			payment: data.payment as PaymentRow | undefined,
			order: data.order as OrderPaymentSummary | undefined,
		});
		answers.push({ kind: entry.kind, data });
	}
	return answers;
}

/**
 * When the session runs the recovery again after a re-send that failed without a definitive
 * answer (a 429, a 5xx, no answer) while the till stays online (Codex 4333265115 on #2798). A
 * reconnect, a restart and Try again still re-send at once.
 */
export const RECOVERY_RETRY_DELAYS_MS: readonly number[] = [
	// A reconnect blip: a rate limit or a proxy restart is over in half a minute.
	30_000,
	// A store restart takes a minute or two.
	120_000,
	// A longer outage: repeated every ten minutes so a down store is not hammered, until a run
	// answers or the next session start re-sends at once.
	600_000,
];

/** A store-session recovery's re-sends for one order, answered. */
interface RecoveredOrder {
	readonly orderUuid: string;
	readonly answers: ResentCommand[];
	/**
	 * The re-send failed without a definitive answer and the command is still journaled and
	 * unclaimed: the session retries it on `RECOVERY_RETRY_DELAYS_MS`.
	 */
	readonly unanswered?: true;
	/** A definitive refusal that settled a re-send: owed a needs-attention entry (ADR 0040 D1 r4). */
	readonly refused?: {
		readonly code: string;
		readonly row: PaymentRow | null;
		readonly summary: OrderPaymentSummary | null;
	};
}

/**
 * The store-session recovery (store session start and every reconnect): re-send every command
 * that was sent and never answered, for every order of the active scope, whether or not a tender
 * is on screen. A pull can adopt a completed sale and take it out of the open orders before the
 * cashier presses Try again; its journaled command must still be answered, mirrored and settled.
 * An order whose command a live claim holds is left to its sender; the session runs the recovery
 * again when that claim lapses (`nextClaimExpiry`, Codex 4332957976 on #2798). A re-send that
 * fails stays journaled for the next recovery or Try again. Then the settled chains are retired.
 */
export async function recoverMoneyCommands(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	deps: { post: Post }
): Promise<RecoveredOrder[]> {
	const recovered: RecoveredOrder[] = [];
	const scope = await activeScopeId(runtime);
	for (const [orderUuid, { entries }] of Object.entries(await readMoneyJournal(storeDB))) {
		const sent = entries.filter((entry) => phaseOf(entry) !== 'unsent' && inScope(entry, scope));
		if (sent.length === 0) {
			// Only crash leftovers: nothing to re-send. Housekeeping never fails the run.
			await dropLeftovers(storeDB, orderUuid, scope, entries).catch(() => undefined);
			continue;
		}
		try {
			recovered.push({
				orderUuid,
				answers: await resendOpenCommands(runtime, storeDB, orderUuid, deps),
			});
		} catch (error) {
			// Not definitive, or refused: the poster kept or settled the entry accordingly. A
			// refusal that settled a command is reported, never swallowed: an offline record refused
			// on reconnect has no tender to tell. A refused pre-flight push settles nothing, so it is
			// no refusal of the command. One still sent, unclaimed and ours is unanswered.
			const journaled = (await readOrderCommands(storeDB, orderUuid)).entries;
			const failure = moneyRefusalOf(error);
			const refused =
				failure?.code &&
				isDefinitiveMoneyRefusal(failure) &&
				sent.some(({ id }) => !journaled.some((entry) => entry.id === id))
					? {
							code: failure.code,
							row: (failure.data?.payment as PaymentRow | undefined) ?? null,
							summary: (failure.data?.order as OrderPaymentSummary | undefined) ?? null,
						}
					: undefined;
			const left = journaled.filter((entry) => {
				const { kind } = commandState(entry);
				return (kind === 'deferred' || kind === 'unanswered') && inScope(entry, scope);
			});
			if (left.length > 0 || refused)
				recovered.push({
					orderUuid,
					answers: [],
					...(left.length > 0 ? { unanswered: true as const } : {}),
					...(refused ? { refused } : {}),
				});
		}
	}
	// Housekeeping bounded by CHAIN_RETENTION_MS; the next run retries it; never fail a replay.
	await retireSettledChains(runtime, storeDB).catch(() => undefined);
	return recovered;
}

/**
 * Retire the chains whose purpose has ended: the order has no open entry and the resident has
 * adopted a later document than the chain's answer under another revision than the post-answer
 * refresh recorded. Revision choice then reads the resident (it holds authority), and the
 * receipt's barrier no longer holds. A chain whose order is not resident stays; age bounds it
 * (`CHAIN_RETENTION_MS`).
 */
async function retireSettledChains(runtime: QueryRuntime, storeDB: StoreLocalDatabase) {
	for (const [orderUuid, { entries, chain }] of Object.entries(await readMoneyJournal(storeDB))) {
		if (!chain || entries.length > 0) continue;
		// A thrown read is not an absence: it propagates; only a null result is not resident.
		const resident = await findEngineResident(runtime, 'orders', orderUuid);
		if (!resident) continue;
		const { adopted } = residentRevision(resident.getLatest().toJSON());
		if (
			adopted?.revision &&
			adopted.at > chain.answeredAt &&
			adopted.revision !== chain.adoptedRevision
		)
			await retireChain(storeDB, orderUuid, chain.answeredAt);
	}
}

function answerChain(revision: unknown, at: number): RevisionChain | undefined {
	return typeof revision === 'string' ? { answerRevision: revision, answeredAt: at } : undefined;
}

/**
 * A drop-in `post` for the money routes: classifies the path, freezes the body (provenance for
 * the completion-capable kinds, minted once here), journals it, and sends it through the
 * envelope. Any other path passes through untouched (the status poll, bootstraps).
 *
 * A retry is a re-send: a call for a command the journal already holds as dispatched (the same
 * kind and target, or for `record` the same row id) re-sends that entry, with its id, frozen
 * body, provenance and approval, whichever poster or process sent it first. A leg's retry, a
 * fresh poster per settlement attempt and Try again all land on the one command the server
 * replays.
 */
export function moneyCommandPoster(input: {
	runtime: QueryRuntime;
	storeDB: StoreLocalDatabase;
	orderUuid: string;
	post: Post;
	/**
	 * The order's total and currency as the cashier approved them at the press. Absent (a void,
	 * a cancel, a record, a resumed leg with no press), the command is frozen with an open journal
	 * entry's approval when the order has one, else the resident's total and currency.
	 */
	approval?: OrderApproval;
	/** Called once, when the command is frozen; it sees the command it describes. */
	provenance?: (command: ProvenanceCommand) => Promise<CommandProvenance | null>;
	/**
	 * Recovery and Try again: re-send only a command the journal holds, never freeze a new one
	 * (adversarial 2 on #2798): that would run a command nobody pressed for, on a sale reopened
	 * since.
	 */
	replay?: true;
}): MoneyCommandPoster {
	let answered: { id: string; chain?: RevisionChain }[] = [];
	// This poster's claim on its commands (see `claimRoute`): taken in the journal write that gets
	// or creates the command, held through the send and its answer, and ended by the settle that
	// deletes the entry. A send that throws gives the claim up at once (the entry stays, for Try
	// again or the recovery); a caller that never settles an answer loses it to `CLAIM_LEASE_MS`.
	const claimant = mintUuid();
	// A failed release is harmless: the 30 s lease (`CLAIM_LEASE_MS`) frees the claim.
	const release = (id: string) =>
		releaseClaim(input.storeDB, input.orderUuid, id, claimant).catch(() => undefined);
	// A definitive refusal settled its own entry, so it is not an answer with a chain; it still
	// says the resident's money is stale (`wcpos_balance_outstanding`,
	// `wcpos_amount_exceeds_balance`), so the next settle runs the corrective refresh for it.
	let refusedSinceSettle = false;
	// The revision the last command went out under, read off the body the envelope sends.
	let sentRevision: string | null = null;
	const send: Post = (url, body) => {
		sentRevision = (body as { revision?: string }).revision ?? null;
		return input.post(url, body);
	};
	/** Send through the envelope, which alone decides what answers the command. */
	const dispatch = async (entry: MoneyCommandEntry) => {
		try {
			const response = await sendMoneyCommand(input.runtime, input.storeDB, entry, { post: send });
			answered.push({ id: entry.id, chain: answerChain(response.data.revision, Date.now()) });
			return response;
		} catch (error) {
			if (isDefinitiveMoneyRefusal(moneyRefusalOf(error))) refusedSinceSettle = true;
			await release(entry.id);
			throw error;
		}
	};
	const freezeApproval = async (entries: readonly MoneyCommandEntry[], target: string | null) => {
		if (input.approval) return input.approval;
		const journaled = entries.find((entry) => entry.target === target) ?? entries[0];
		if (journaled) return journaled.approval;
		const { payload } = (await readOrder(input.runtime, input.orderUuid)).order;
		return { total: String(payload.total ?? ''), currency: String(payload.currency ?? '') };
	};
	const settle = async () => {
		const done = answered;
		const refused = refusedSinceSettle;
		answered = [];
		refusedSinceSettle = false;
		for (const { id, chain } of done)
			await settleCommand(input.storeDB, input.orderUuid, id, chain);
		if (done.length || refused)
			await settleMoneyCommand(input.runtime, input.storeDB, input.orderUuid);
	};
	/** Freeze a new command for the route: provenance (minted once here), id, approval, scope. */
	const freeze = async (
		url: string,
		route: NonNullable<ReturnType<typeof classifyMoneyRoute>>,
		frozen: Record<string, unknown>,
		rowId: string | null
	): Promise<MoneyCommandEntry> => {
		const { entries } = await readOrderCommands(input.storeDB, input.orderUuid);
		const scope = await activeScopeId(input.runtime);
		const provenance = PROVENANCE_KINDS.has(route.kind)
			? await input.provenance?.({ kind: route.kind, target: route.target, body: frozen })
			: null;
		return {
			orderUuid: input.orderUuid,
			kind: route.kind,
			path: url,
			target: route.target,
			id: rowId ?? mintUuid(),
			body: provenance ? { ...frozen, provenance } : frozen,
			approval: await freezeApproval(
				entries.filter((entry) => phaseOf(entry) !== 'unsent'),
				route.target
			),
			sentAt: null,
			sentRevision: null,
			scope,
		};
	};
	/** Get or create, and claim, the route's command; null when the path is no money route. */
	const claimFor = async (url: string, body: unknown) => {
		const route = classifyMoneyRoute(url);
		if (!route) return null;
		const frozen = { ...(body as Record<string, unknown>) };
		const rowId =
			route.kind === 'record'
				? String((frozen.payment as { id?: unknown } | undefined)?.id ?? '')
				: null;
		const commandRoute = {
			orderUuid: input.orderUuid,
			kind: route.kind,
			target: route.target,
			rowId,
		};
		// Get or create, and claim, in one serialised journal write (`claimRoute`): two posters
		// for one route, in this tab or another, always land on one command id. A sent command is
		// re-sent under its own id; a new one is frozen only when the journal holds none.
		let claim = await claimRoute(input.storeDB, commandRoute, claimant, null);
		if (claim.status === 'none' && !input.replay)
			claim = await claimRoute(
				input.storeDB,
				commandRoute,
				claimant,
				await freeze(url, route, frozen, rowId)
			);
		if (claim.status === 'busy') throw new MoneyCommandError('in_flight', claim.entry);
		if (claim.status === 'none') throw new Error('money_command_unclaimed');
		return claim;
	};
	const poster = async (url: string, body: unknown) => {
		const claim = await claimFor(url, body);
		return claim ? dispatch(claim.entry) : input.post(url, body);
	};
	const defer = async (url: string, body: unknown) => {
		if (classifyMoneyRoute(url)?.kind !== 'record') throw new Error('money_command_not_deferrable');
		const claim = (await claimFor(url, body))!;
		// Already journaled under this row id (a press after a crash between defer and mirror):
		// the same record, never a second one for the same cash.
		if (claim.status === 'open') {
			await release(claim.entry.id);
			return claim.entry;
		}
		const deferred = await deferEntry(input.storeDB, input.orderUuid, claim.entry.id, claimant);
		if (!deferred) throw new MoneyCommandError('in_flight', claim.entry);
		return deferred;
	};
	return Object.assign(poster, {
		mirror: async ({
			revision,
			...answer
		}: Omit<MoneyAnswer, 'sentRevision'> & { revision?: unknown }) => {
			// Dated at arrival, before the mirror's awaits: an adoption that lands during them is
			// newer than this answer and must keep its revision (the stamp guard compares the two).
			const answeredAt = Date.now();
			try {
				await mirrorMoneyAnswer(input.runtime, input.orderUuid, { ...answer, sentRevision });
			} catch (error) {
				// Not settled: the entries stay journaled, their claims given up for a re-send.
				for (const { id } of answered) await release(id);
				throw error;
			}
			// A poll that settled the row moved the order: record its revision and stamp it for the
			// next push, never a refresh. The next poll's summary lands under the stamp this one made.
			const polled = answerChain(revision, answeredAt);
			if (polled) {
				await settleCommand(input.storeDB, input.orderUuid, null, { ...polled, polled: true });
				const { replaced } = await input.runtime.engine.orderRevision.stamp(
					input.orderUuid,
					polled.answerRevision,
					polled.answeredAt
				);
				if (replaced && replaced === sentRevision) sentRevision = polled.answerRevision;
			}
			await settle();
		},
		settle,
		defer,
		retire: (kind: MoneyCommandKind, target: string | null) =>
			retireRoute(input.storeDB, input.orderUuid, kind, target),
		abandon: async () => {
			const open = answered;
			answered = [];
			for (const { id } of open) await release(id);
		},
	});
}
