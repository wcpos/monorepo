import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import {
	isDefinitiveMoneyRefusal,
	isMoneyAnswer,
	MONEY_ANSWER_CODES,
	moneyRefusalOf,
} from '@wcpos/sync-core';

import { mintUuid } from '../mint-uuid';
import { mirrorServerOrder, type MoneyAnswer } from '../mutations/mirror-server-order';
import { pushRecord } from '../mutations/push-record';
import { findEngineResident } from '../mutations/resident';
import { refreshRecordByWooId } from '../record-readers/refresh-records';
import {
	claimHeld,
	claimRoute,
	dropUnsent,
	markSent,
	type MoneyCommandEntry,
	type MoneyCommandKind,
	type OrderApproval,
	readMoneyJournal,
	readOrderCommands,
	releaseClaim,
	retireChain,
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
export type { MoneyCommandEntry, MoneyCommandKind, OrderApproval, RevisionChain };
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
export type MoneyCommandPoster = Post & {
	/**
	 * Mirror an answer onto the LATEST resident under the revision the last command was sent
	 * with (the summary's status lands only while the resident still carries it), then settle:
	 * delete the answered entries and run the forced refresh.
	 */
	mirror(answer: Omit<MoneyAnswer, 'sentRevision'>): Promise<void>;
	/**
	 * Delete the answered entries, then the forced refresh (what `mirror` ends with). A definitive
	 * refusal since the last settle also earns the refresh, never an answer chain.
	 */
	settle(): Promise<void>;
	/** Give up the answered entries' claims without settling them: they stay for a re-send. */
	abandon(): Promise<void>;
};

/** The cashier's approval is re-checked for the commands that move money on a total. */
const APPROVED_KINDS = new Set<MoneyCommandKind>(['intent', 'submit', 'close']);
const PROVENANCE_KINDS = new Set<MoneyCommandKind>([
	'record',
	'intent',
	'capture',
	'submit',
	'close',
]);
const ROUTE =
	/^orders\/(\d+)\/(?:payments(?:\/([^/]+)\/(intent|capture|void|refund))?|payment-methods\/([^/]+)\/(submit|cancel)|(close))$/;

export function classifyMoneyRoute(
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

/**
 * The corrective refresh: re-adopts the document even under an equal stamp. An adoption this
 * refresh causes is later than the chain's answer by construction, whatever the wall clock says,
 * so when the clock has stepped back since the answer the chain records it (its `answeredAt`
 * moves below the adoption's `at`): a clock step can never wedge authority, and so approvals.
 */
async function readopt(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	orderId: number
): Promise<{ order: ResidentOrder; chain: RevisionChain | null }> {
	const before = (await readOrder(runtime, orderUuid)).order.sync?.adopted;
	await refreshRecordByWooId(runtime.engine, {
		id: `money-command:readopt:${orderId}`,
		collection: 'orders',
		wooId: orderId,
		readopt: true,
	}).catch(() => undefined);
	const { order } = await readOrder(runtime, orderUuid);
	const { chain } = await readOrderCommands(storeDB, orderUuid);
	const adopted = order.sync?.adopted;
	const adoptedNow =
		!!adopted &&
		adopted.revision === order.sync.revision &&
		(adopted.at !== before?.at || adopted.revision !== before?.revision);
	if (!chain || !adoptedNow || (adopted.at ?? 0) > chain.answeredAt) return { order, chain };
	const recorded = { ...chain, answeredAt: (adopted.at ?? 0) - 1 };
	await settleCommand(storeDB, orderUuid, null, recorded);
	return { order, chain: recorded };
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
	if (fresh && (order.local?.dirty || (order.local?.pendingMutationIds?.length ?? 0) > 0)) {
		await pushRecord(runtime, resident as never);
		({ resident, order } = await readOrder(runtime, entry.orderUuid));
	}
	let { chain } = await readOrderCommands(storeDB, entry.orderUuid);
	// A re-send reaches here only without a sent revision of its own (see sendMoneyCommand).
	const approved = APPROVED_KINDS.has(entry.kind);
	if (
		!holdsAuthority(order, chain) &&
		(approved || !(chain?.answerRevision || order.sync?.revision))
	) {
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
	const orderId = classifyMoneyRoute(entry.path)?.orderId ?? 0;
	const fresh = entry.sentAt === null;
	// A re-send of an approved command goes out under the revision it was first sent with. The
	// server checks the replay before the revision, so a stored command replays; one it never
	// stored is refused as stale, and the stale path re-checks the approval against the document
	// it adopts before it re-sends once. A re-send never borrows a newer revision the cashier did
	// not approve against: a remote reopen, then a restart, must not close the reopened sale.
	let revision: string;
	if (!fresh && APPROVED_KINDS.has(entry.kind) && entry.sentRevision) revision = entry.sentRevision;
	else
		try {
			revision = await chooseRevision(runtime, storeDB, entry, orderId, fresh);
		} catch (error) {
			if (!fresh) throw error;
			// Never dispatched: nothing can be on the server, so the outcome is terminal and typed.
			await settleCommand(storeDB, entry.orderUuid, entry.id);
			throw error instanceof MoneyCommandError
				? error
				: new MoneyCommandError('preflight_failed', entry, undefined, { cause: error });
		}
	for (let stale = false; ; stale = true) {
		await markSent(storeDB, entry.orderUuid, entry.id, revision);
		try {
			const command = entry.kind === 'record' ? {} : { command_id: entry.id };
			const { data } = await deps.post(entry.path, { ...entry.body, ...command, revision });
			// A non-JSON 2xx (a proxy page) proves nothing: the entry stays for a re-send.
			if (!data || typeof data !== 'object') throw new Error('money_command_unreadable_answer');
			return { data: data as Record<string, unknown>, sentRevision: revision };
		} catch (error) {
			const failure = moneyRefusalOf(error);
			if (failure?.code === MONEY_ANSWER_CODES.revisionStale && !stale) {
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
					await settleCommand(storeDB, entry.orderUuid, entry.id);
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
					await mirrorServerOrder(runtime, entry.orderUuid, { payment, sentRevision: revision });
				await settleCommand(storeDB, entry.orderUuid, entry.id);
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
	if (!order.payload.id) return;
	const { order: after, chain } = await readopt(runtime, storeDB, orderUuid, order.payload.id);
	if (chain && holdsAuthority(after, chain))
		await settleCommand(storeDB, orderUuid, null, {
			...chain,
			adoptedAfterAnswer: true,
			adoptedRevision: after.sync.revision,
		});
}

/**
 * Retire the chains whose purpose has ended: the order has no open entry and the resident has
 * adopted a later document than the chain's answer under another revision than the post-answer
 * refresh recorded. Revision choice then reads the resident (it holds authority), and the
 * receipt's barrier no longer holds. A chain whose order is not resident stays; age bounds it
 * (`CHAIN_RETENTION_MS`).
 */
export async function retireSettledChains(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase
): Promise<void> {
	for (const [orderUuid, { entries, chain }] of Object.entries(await readMoneyJournal(storeDB))) {
		if (!chain || entries.length > 0) continue;
		const resident = await findEngineResident(runtime, 'orders', orderUuid).catch(() => null);
		if (!resident) continue;
		const { adopted } = (resident.getLatest().toJSON() as unknown as ResidentOrder).sync ?? {};
		if (
			adopted?.revision &&
			(adopted.at ?? 0) > chain.answeredAt &&
			adopted.revision !== chain.adoptedRevision
		)
			await retireChain(storeDB, orderUuid, chain.answeredAt);
	}
}

/** Whether the forced refresh adopts the order's whole document, stamped at or after `since`. */
async function adoptedSince(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	since: number
): Promise<boolean> {
	const { order } = await readOrder(runtime, orderUuid);
	if (!order.payload.id) return false;
	const { order: after } = await readopt(runtime, storeDB, orderUuid, order.payload.id);
	const adopted = after.sync?.adopted;
	return !!adopted && adopted.revision === after.sync.revision && (adopted.at ?? 0) >= since;
}

/** The engine scope the till is in now: one cashier's orders. */
async function activeScopeId(runtime: QueryRuntime): Promise<string | null> {
	const scope = runtime.engine.active() ?? (await runtime.engine.whenActive());
	return scope?.scopeId ?? null;
}
/** A command belongs to the scope that sent it; one written before scopes were recorded, to any. */
function inScope(entry: MoneyCommandEntry, scope: string | null) {
	return !entry.scope || entry.scope === scope;
}

/** A re-sent command and the store's 2xx answer to it. */
export interface ResentCommand {
	readonly kind: MoneyCommandKind;
	readonly data: Record<string, unknown>;
}

/**
 * Try again: re-send every dispatched command of the order through a poster (the same entry,
 * id and frozen body), mirror each answer and settle it; a never-sent one is dropped. Returns
 * the answers, so the caller finishes the sale from them as from a first answer.
 */
export async function resendOpenCommands(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	deps: { post: Post }
): Promise<ResentCommand[]> {
	// Only the active scope's commands: another cashier's order is not resident here, so its
	// command waits for that cashier's scope (no cross-scope replay).
	const scope = await activeScopeId(runtime);
	const entries = (await readOrderCommands(storeDB, orderUuid)).entries.filter((entry) =>
		inScope(entry, scope)
	);
	const poster = moneyCommandPoster({ runtime, storeDB, orderUuid, post: deps.post });
	const answers: ResentCommand[] = [];
	for (const entry of entries) {
		if (entry.sentAt === null) {
			await dropUnsent(storeDB, orderUuid, entry.id, null);
			continue;
		}
		const since = Date.now();
		const { data } = (await poster(entry.path, entry.body)) as { data: Record<string, unknown> };
		// A replayed submit or cancel cannot carry the awaiting-customer stamp its first answer
		// wrote or cleared (the stamp needs the press's destination and cashier); only the server
		// document does. So it settles only once the refresh has adopted that document, and stays
		// journaled otherwise: a resident with a gateway's `pending` status and no stamp would read
		// as a settled sale.
		if (
			(entry.kind === 'submit' || entry.kind === 'cancel') &&
			!(await adoptedSince(runtime, storeDB, orderUuid, since))
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

/** A store-session recovery's re-sends for one order, answered. */
export interface RecoveredOrder {
	readonly orderUuid: string;
	readonly answers: ResentCommand[];
}

/**
 * The store-session recovery (store session start and every reconnect): re-send every command
 * that was sent and never answered, for every order, whether or not a tender is on screen. A pull
 * can adopt a completed sale and take it out of the open orders before the cashier presses Try
 * again; its journaled command must still be answered, mirrored and settled. An order whose
 * command is on the wire from this process is left to its sender. A re-send that fails stays
 * journaled for the next recovery or Try again. Then the settled chains are retired.
 */
export async function recoverMoneyCommands(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	deps: { post: Post }
): Promise<RecoveredOrder[]> {
	const recovered: RecoveredOrder[] = [];
	const scope = await activeScopeId(runtime);
	for (const [orderUuid, { entries }] of Object.entries(await readMoneyJournal(storeDB))) {
		const sent = entries.filter((entry) => entry.sentAt !== null && inScope(entry, scope));
		if (sent.length === 0 || sent.some((entry) => claimHeld(entry, null))) continue;
		try {
			recovered.push({
				orderUuid,
				answers: await resendOpenCommands(runtime, storeDB, orderUuid, deps),
			});
		} catch {
			// Not definitive, or refused: the poster kept or settled the entry accordingly.
		}
	}
	await retireSettledChains(runtime, storeDB).catch(() => undefined);
	return recovered;
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
}): MoneyCommandPoster {
	let answered: { id: string; chain?: RevisionChain }[] = [];
	// This poster's claim on its commands (see `claimRoute`): taken in the journal write that gets
	// or creates the command, held through markSent, the post, a stale adoption and its re-send,
	// and the answer, and ended by the settle that deletes the entry. A send that throws gives the
	// claim up at once (the entry stays, for Try again or the recovery); a caller that never
	// settles an answer loses it to `CLAIM_LEASE_MS`.
	const claimant = mintUuid();
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
	const dispatch = async (entry: MoneyCommandEntry) => {
		try {
			const response = await sendMoneyCommand(input.runtime, input.storeDB, entry, {
				post: send,
			}).catch((error: unknown) => {
				if (isDefinitiveMoneyRefusal(moneyRefusalOf(error))) refusedSinceSettle = true;
				throw error;
			});
			// A command is answered only by the store's own row, summary or completion for its
			// kind (sync-core `isMoneyAnswer`), whoever sent it: the first press, Try again or the
			// session recovery. Anything else is never answered here, so the entry stays
			// journaled, its outcome unknown until a re-send answers it.
			if (!isMoneyAnswer(entry.kind, response.data))
				throw new Error(
					entry.kind === 'close' ? 'close_malformed_response' : 'money_command_malformed_answer'
				);
			answered.push({ id: entry.id, chain: answerChain(response.data.revision, Date.now()) });
			return response;
		} catch (error) {
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
	/** Freeze a new command for the route: provenance (minted once here), id and approval. */
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
				entries.filter(({ sentAt }) => sentAt !== null),
				route.target
			),
			sentAt: null,
			sentRevision: null,
			...(scope ? { scope } : {}),
		};
	};
	const poster = async (url: string, body: unknown) => {
		const route = classifyMoneyRoute(url);
		if (!route) return input.post(url, body);
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
		if (claim.status === 'none')
			claim = await claimRoute(
				input.storeDB,
				commandRoute,
				claimant,
				await freeze(url, route, frozen, rowId)
			);
		if (claim.status === 'busy') throw new MoneyCommandError('in_flight', claim.entry);
		if (claim.status === 'none') throw new Error('money_command_unclaimed');
		return dispatch(claim.entry);
	};
	return Object.assign(poster, {
		mirror: async (answer: Omit<MoneyAnswer, 'sentRevision'>) => {
			try {
				await mirrorServerOrder(input.runtime, input.orderUuid, { ...answer, sentRevision });
			} catch (error) {
				// Not settled: the entries stay journaled, their claims given up for a re-send.
				for (const { id } of answered) await release(id);
				throw error;
			}
			await settle();
		},
		settle,
		abandon: async () => {
			const open = answered;
			answered = [];
			for (const { id } of open) await release(id);
		},
	});
}
