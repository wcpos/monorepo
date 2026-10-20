import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';

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
export type MoneyCommandErrorReason = 'revision_unavailable' | 'order_changed';
export class MoneyCommandError extends Error {
	public constructor(
		public readonly reason: MoneyCommandErrorReason,
		public readonly entry: MoneyCommandEntry,
		public readonly order?: OrderPaymentSummary
	) {
		super(`money_command_${reason}`);
		this.name = 'MoneyCommandError';
	}
}
export type MoneyCommandPoster = Post & {
	/** The revision the last command was sent with, answered or refused (the mirror's guard). */
	sentRevision(): string | null;
	/** After the mirror persisted the answers: delete their entries, then the forced refresh. */
	settle(): Promise<void>;
	/** Re-send the last journaled command under its frozen body and id (the server replays). */
	resend(): Promise<{ data: Record<string, unknown> }>;
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
/** Refusals naming this row or command: the server decided, and a re-send would repeat it. */
const DEFINITIVE_CODES = new Set([
	'wcpos_command_conflict',
	'wcpos_order_already_paid',
	'wcpos_invalid_transition',
	'wcpos_amount_exceeds_balance',
	'wcpos_balance_outstanding',
	'wcpos_payment_in_flight',
	'wcpos_insufficient_stock',
	'rest_invalid_param',
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

type Failure = { code?: string; data?: Record<string, unknown> };
function failureOf(error: unknown): Failure | null {
	const response = (error as { response?: { data?: unknown } } | null)?.response;
	if (!response || typeof response !== 'object') return null;
	const body = response.data as { code?: unknown; data?: unknown } | null | undefined;
	if (!body || typeof body !== 'object') return {};
	return {
		...(typeof body.code === 'string' ? { code: body.code } : {}),
		...(body.data && typeof body.data === 'object'
			? { data: body.data as Record<string, unknown> }
			: {}),
	};
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
async function readopt(runtime: QueryRuntime, orderId: number): Promise<void> {
	await refreshRecordByWooId(runtime.engine, {
		id: `money-command:readopt:${orderId}`,
		collection: 'orders',
		wooId: orderId,
		readopt: true,
	}).catch(() => undefined);
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
	const { chain } = await readOrderCommands(storeDB, entry.orderUuid);
	const approved = fresh && APPROVED_KINDS.has(entry.kind);
	if (
		!holdsAuthority(order, chain) &&
		(approved || !(chain?.answerRevision || order.sync?.revision))
	) {
		await readopt(runtime, orderId);
		({ order } = await readOrder(runtime, entry.orderUuid));
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
	let revision: string;
	try {
		revision = await chooseRevision(runtime, storeDB, entry, orderId, fresh);
	} catch (error) {
		if (fresh) await settleCommand(storeDB, entry.orderUuid, entry.id);
		throw error;
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
			const failure = failureOf(error);
			if (failure?.code === 'wcpos_revision_stale' && !stale) {
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
			if (failure?.code && DEFINITIVE_CODES.has(failure.code)) {
				const payment = failure.data?.payment as PaymentRow | undefined;
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
	await readopt(runtime, order.payload.id);
	const after = (await readOrder(runtime, orderUuid)).order;
	const { chain } = await readOrderCommands(storeDB, orderUuid);
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
 */
export function moneyCommandPoster(input: {
	runtime: QueryRuntime;
	storeDB: StoreLocalDatabase;
	orderUuid: string;
	post: Post;
	/** Frozen at the cashier's press; a resumed leg (no press) reads the order when it freezes. */
	approval: OrderApproval | (() => Promise<OrderApproval>);
	provenance?: () => Promise<CommandProvenance | null>;
}): MoneyCommandPoster {
	let answered: { id: string; chain?: RevisionChain }[] = [];
	let sentRevision: string | null = null;
	let last: MoneyCommandEntry | null = null;
	const dispatch = async (entry: MoneyCommandEntry) => {
		last = entry;
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
		const provenance = PROVENANCE_KINDS.has(route.kind) ? await input.provenance?.() : null;
		if (provenance) frozen.provenance = provenance;
		const entry: MoneyCommandEntry = {
			orderUuid: input.orderUuid,
			kind: route.kind,
			path: url,
			target: route.target,
			id:
				route.kind === 'record'
					? String((frozen.payment as { id?: unknown } | undefined)?.id ?? '')
					: mintUuid(),
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
		resend: async () => {
			const { entries } = await readOrderCommands(input.storeDB, input.orderUuid);
			const entry = entries.find(({ id }) => id === last?.id);
			if (!entry) throw new Error('money_command_not_journaled');
			return dispatch(entry);
		},
		settle: async () => {
			const done = answered;
			answered = [];
			for (const { id, chain } of done)
				await settleCommand(input.storeDB, input.orderUuid, id, chain);
			if (done.length) await settleMoneyCommand(input.runtime, input.storeDB, input.orderUuid);
		},
	});
}
