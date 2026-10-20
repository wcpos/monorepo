import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import { isDefinitiveMoneyRefusal, MONEY_ANSWER_CODES, moneyRefusalOf } from '@wcpos/sync-core';

import { mintUuid } from '../mint-uuid';
import { mirrorServerOrder } from '../mutations/mirror-server-order';
import { pushRecord } from '../mutations/push-record';
import { findEngineResident } from '../mutations/resident';
import { refreshRecordByWooId } from '../record-readers/refresh-records';
import {
	journalCommand,
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
export type MoneyCommandErrorReason = 'revision_unavailable' | 'order_changed' | 'preflight_failed';
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
	/** The revision the last command was sent with, answered or refused (the mirror's guard). */
	sentRevision(): string | null;
	/** After the mirror persisted the answers: delete their entries, then the forced refresh. */
	settle(): Promise<void>;
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
	deps: { post: Post; onSent?: (revision: string) => void }
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
		deps.onSent?.(revision);
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

/** Try again: re-send every dispatched command of the order; a never-sent one is dropped. */
export async function resendOpenCommands(
	runtime: QueryRuntime,
	storeDB: StoreLocalDatabase,
	orderUuid: string,
	deps: { post: Post }
): Promise<void> {
	const { entries } = await readOrderCommands(storeDB, orderUuid);
	for (const entry of entries) {
		if (entry.sentAt === null) {
			await settleCommand(storeDB, orderUuid, entry.id);
			continue;
		}
		const { data, sentRevision } = await sendMoneyCommand(runtime, storeDB, entry, deps);
		await mirrorServerOrder(runtime, orderUuid, {
			payment: data.payment as PaymentRow | undefined,
			order: data.order as OrderPaymentSummary | undefined,
			sentRevision,
		});
		await settleCommand(storeDB, orderUuid, entry.id, answerChain(data.revision, Date.now()));
	}
	if (entries.length) await settleMoneyCommand(runtime, storeDB, orderUuid);
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
	/** Frozen at the cashier's press; a resumed leg (no press) reads the order when it freezes. */
	approval: OrderApproval | (() => Promise<OrderApproval>);
	/** Called once, when the command is frozen; it sees the command it describes. */
	provenance?: (command: ProvenanceCommand) => Promise<CommandProvenance | null>;
}): MoneyCommandPoster {
	let answered: { id: string; chain?: RevisionChain }[] = [];
	let sentRevision: string | null = null;
	const dispatch = async (entry: MoneyCommandEntry) => {
		const response = await sendMoneyCommand(input.runtime, input.storeDB, entry, {
			post: input.post,
			onSent: (revision) => (sentRevision = revision),
		});
		answered.push({ id: entry.id, chain: answerChain(response.data.revision, Date.now()) });
		return response;
	};
	const poster = async (url: string, body: unknown) => {
		const route = classifyMoneyRoute(url);
		if (!route) return input.post(url, body);
		const frozen = { ...(body as Record<string, unknown>) };
		const rowId =
			route.kind === 'record'
				? String((frozen.payment as { id?: unknown } | undefined)?.id ?? '')
				: null;
		const same = (entry: MoneyCommandEntry) =>
			entry.kind === route.kind &&
			(rowId === null ? entry.target === route.target : entry.id === rowId);
		const { entries } = await readOrderCommands(input.storeDB, input.orderUuid);
		const open = entries.find((entry) => same(entry) && entry.sentAt !== null);
		if (open) return dispatch(open);
		// A never-dispatched leftover (a crash before it was sent) put nothing on the server.
		for (const unsent of entries.filter(same))
			await settleCommand(input.storeDB, input.orderUuid, unsent.id);
		const provenance = PROVENANCE_KINDS.has(route.kind)
			? await input.provenance?.({ kind: route.kind, target: route.target, body: frozen })
			: null;
		if (provenance) frozen.provenance = provenance;
		const entry: MoneyCommandEntry = {
			orderUuid: input.orderUuid,
			kind: route.kind,
			path: url,
			target: route.target,
			id: rowId ?? mintUuid(),
			body: frozen,
			approval: typeof input.approval === 'function' ? await input.approval() : input.approval,
			sentAt: null,
			sentRevision: null,
		};
		await journalCommand(input.storeDB, entry);
		return dispatch(entry);
	};
	return Object.assign(poster, {
		sentRevision: () => sentRevision,
		settle: async () => {
			const done = answered;
			answered = [];
			for (const { id, chain } of done)
				await settleCommand(input.storeDB, input.orderUuid, id, chain);
			if (done.length) await settleMoneyCommand(input.runtime, input.storeDB, input.orderUuid);
		},
	});
}
