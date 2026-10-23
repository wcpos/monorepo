import { v4 as uuidv4 } from 'uuid';

import { MoneyCommandError, type MoneyCommandErrorReason } from '@wcpos/query';
import {
	isDefinitiveMoneyRefusal,
	isMoneyAnswer,
	moneyRefusalOf,
	PAYMENT_ROW_REFUSALS,
	type PaymentRowRefusal,
} from '@wcpos/sync-core';
import {
	derive,
	mintManualPayment,
	readLedger,
	toMinor,
	upsertPaymentRow,
} from '@wcpos/order-math';
import type {
	MetaDataEntry,
	OrderPaymentSummary,
	PaymentMethodDescriptor,
	PaymentRow,
} from '@wcpos/order-math';

/**
 * Record a `manual` payment (cash, dummy card) against an order — Payments Contract v1
 * §5 / §7 (wcpos/roadmap#142). The ledger lives in the order's `_wcpos_payments`
 * typed meta, which the server owns: a row goes through `POST orders/{id}/payments` as a
 * journaled money command and the server's copy is mirrored back; offline the record is
 * journaled for the recovery to send on reconnect and the till's own derivation is mirrored
 * (ADR 0040 Decided 1). Pure apart from the injected deps so the decision tree is testable.
 */

export interface RecordManualPaymentOrder {
	uuid: string;
	id: number | null;
	number?: string;
	total: string | number | null | undefined;
	meta_data: MetaDataEntry[];
}
export interface RecordManualPaymentInput {
	/** Facts about the sale as it completes (the split summary); merged by key when this leg completes it. */
	extraMeta?: MetaDataEntry[];
	amount: string | number;
	tendered?: string | number | null;
	/** The row's id when the caller has already named it (a rounding fee line points at it). */
	paymentId?: string;
}
export interface RecordManualPaymentDeps {
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
	isOnline: () => boolean;
	cashierId: number;
	storeId: number | null;
	registerId: string | null;
	sessionId?: string | null;
	/** `push: false` offline: the stamp is saved locally and rides the deferred record's push. */
	persistProvenance?: (options: { push: boolean }) => Promise<void>;
	/** Journal the record without sending it (the poster's `defer`): the offline path. */
	journal: (url: string, body: unknown) => Promise<unknown>;
	currency: string;
	dp: number;
	sleep?: (ms: number) => Promise<void>;
	/**
	 * A record the store may hold but never answered (the journal keeps it sent): the press
	 * replays it, same row id and frozen body, instead of minting a second payment for the same
	 * cash (Codex 4342921641 on #2832).
	 */
	unansweredRecord?: () => Promise<PaymentRow | null>;
	/** Mirror the answered row onto the latest resident (never a pre-command snapshot). */
	mirror: (
		answer: { payment: PaymentRow; status?: string },
		options: { accepted: boolean; local?: true }
	) => Promise<void>;
	/**
	 * The order's status as the server holds it, for a refusal whose body omits the
	 * summary. `null` when the server cannot be asked — the mirror then leaves the
	 * local status alone rather than asserting a stale one.
	 */
	fetchOrderStatus: () => Promise<string | null>;
	raiseAttention: (entry: {
		row: PaymentRow;
		order: OrderPaymentSummary | null;
		reason: RefusalReason;
	}) => void;
	now?: () => string;
	uuid?: () => string;
}
type InvalidReason =
	'not_manual' | 'amount_not_positive' | 'tendered_not_allowed' | 'tendered_below_amount';
type RefusalReason = PaymentRowRefusal;
export type RecordManualPaymentOutcome =
	| {
			kind: 'recorded';
			via: 'online' | 'offline';
			row: PaymentRow;
			order: OrderPaymentSummary | null;
	  }
	| { kind: 'refused'; reason: RefusalReason; row: PaymentRow; order: OrderPaymentSummary | null }
	| { kind: 'failed'; reason: 'provenance_save_failed' | 'offline_unavailable' }
	/** Never dispatched (pre-flight failed, no revision, order changed): nothing reached the store. */
	| { kind: 'failed'; reason: MoneyCommandErrorReason; cause?: unknown }
	/** No answer after every re-send: the journal keeps the command, and Try again re-sends it. */
	| { kind: 'unknown'; row: PaymentRow }
	| { kind: 'invalid'; reason: InvalidReason };

/**
 * A 5xx, a lost answer or a held order lock is re-sent after each of these, the same row and
 * body: long enough to ride out a proxy restart, short enough to wait for at a till.
 */
export const RECORD_UNKNOWN_RETRY_DELAYS_MS = [1000, 3000, 9000] as const;

export class RecordManualPaymentError extends Error {
	public constructor(
		message: string,
		public code: string,
		public status: number | undefined
	) {
		super(message);
		this.name = 'RecordManualPaymentError';
	}
}

type ReconciliationOutcome = Extract<RecordManualPaymentOutcome, { kind: 'recorded' | 'refused' }>;

export class RecordManualPaymentMirrorError extends Error {
	public constructor(
		public outcome: ReconciliationOutcome,
		public cause: unknown
	) {
		super('Payment outcome could not be mirrored locally.', { cause });
		this.name = 'RecordManualPaymentMirrorError';
	}
}

/**
 * ADR 0040 Decided 1 rules 2-3: journaled, never sent, and the till asserts its derived status
 * (`local`). Only the journal says "unanswered": a reconnect can adopt the unpaid store document.
 */
async function recordOffline(
	order: RecordManualPaymentOrder,
	method: PaymentMethodDescriptor,
	row: PaymentRow,
	deps: RecordManualPaymentDeps
): Promise<RecordManualPaymentOutcome> {
	try {
		await deps.journal(`orders/${order.id}/payments`, { payment: row });
	} catch (error) {
		const reason = error instanceof MoneyCommandError ? error.reason : 'preflight_failed';
		return { kind: 'failed', reason, cause: error };
	}
	const rows = upsertPaymentRow(readLedger(order.meta_data), row);
	const { status } = derive(order.total, rows, [method], { dp: deps.dp });
	const outcome = { kind: 'recorded', via: 'offline', row, order: null } as const;
	try {
		await deps.mirror({ payment: row, status }, { accepted: true, local: true });
	} catch (mirrorError) {
		throw new RecordManualPaymentMirrorError(outcome, mirrorError);
	}
	return outcome;
}

export async function recordManualPayment(
	order: RecordManualPaymentOrder,
	method: PaymentMethodDescriptor,
	input: RecordManualPaymentInput,
	deps: RecordManualPaymentDeps
): Promise<RecordManualPaymentOutcome> {
	const hasId = Number.isInteger(order.id) && Number(order.id) > 0;
	const online = deps.isOnline() && hasId;
	const minted = mintManualPayment({
		method,
		amount: input.amount,
		tendered: input.tendered,
		currency: deps.currency,
		orderId: order.id,
		cashierId: deps.cashierId,
		storeId: deps.storeId,
		registerId: deps.registerId,
		sessionId: deps.sessionId,
		recordedOffline: !online,
		now: deps.now ?? (() => new Date().toISOString()),
		uuid: input.paymentId ? () => input.paymentId as string : (deps.uuid ?? uuidv4),
		dp: deps.dp,
	});
	if (!minted.ok) return { kind: 'invalid', reason: minted.reason };
	// An order created offline has no `orders/{id}/payments` route to journal against: its own
	// slice. The tender refuses it first (`order_not_on_store_yet`); this is the backstop.
	if (!hasId) return { kind: 'failed', reason: 'offline_unavailable' };
	const row = (await deps.unansweredRecord?.()) ?? minted.row;

	const { balance } = derive(order.total, readLedger(order.meta_data), [method], { dp: deps.dp });
	if (toMinor(row.amount, deps.dp) === toMinor(balance, deps.dp)) {
		try {
			await deps.persistProvenance?.({ push: online });
		} catch {
			return { kind: 'failed', reason: 'provenance_save_failed' };
		}
	}
	if (!online) return recordOffline(order, method, row, deps);

	// Only the request is inside the try: once the server has answered 2xx the row is
	// recorded, and a failure while mirroring it locally must surface as that failure —
	// never as a re-send, which the journal already holds for Try again.
	// Every attempt is the same call: the poster re-sends the journaled record for this row id,
	// its frozen body and identity, and the server replays a row it already stored.
	let accepted: { payment: PaymentRow; order: OrderPaymentSummary } | undefined;
	for (let attempt = 0; !accepted; attempt++)
		try {
			const response = await deps.post(`orders/${order.id}/payments`, { payment: row });
			// Only the store's own row and summary record the payment (sync-core `isMoneyAnswer`):
			// a malformed 2xx proves nothing and is never replaced by the minted row, so it is
			// handled like no answer at all, and the journal keeps the record for a re-send.
			if (!isMoneyAnswer('record', response.data))
				throw new Error('money_command_malformed_answer');
			accepted = response.data as { payment: PaymentRow; order: OrderPaymentSummary };
		} catch (error) {
			// Refused before it left the till (the pre-flight failed, no revision, the order
			// changed): nothing was sent, so it is terminal, never the unknown re-send path.
			if (error instanceof MoneyCommandError && error.entry.sentAt === null)
				return { kind: 'failed', reason: error.reason, cause: error.cause };
			const refusal = moneyRefusalOf(error);
			const refused = refusal?.data as
				{ payment?: PaymentRow; order?: OrderPaymentSummary } | undefined;
			const reason = refusal?.code
				? (PAYMENT_ROW_REFUSALS as Record<string, RefusalReason | undefined>)[refusal.code]
				: undefined;
			if (reason) {
				// The server STORED the refused row as `failed`; put the order in front of the
				// cashier independently, then mirror the server's copy into the ledger.
				const failedRow = refused?.payment ?? {
					...row,
					status: 'failed',
					failure_reason: reason,
				};
				const serverOrder = refused?.order ?? null;
				deps.raiseAttention({ row: failedRow, order: serverOrder, reason });
				// A refusal IS the server saying our copy of the order is stale — it is already
				// paid, or its balance is smaller than the one we held. Mirroring the failed row
				// under the stale local status would leave a paid order sitting at `pending`, so
				// when the refusal body omits the summary, ask the server for the order's status
				// before mirroring. A failed refresh is not fatal: the row and the attention
				// entry still land, the status is simply left untouched.
				let authoritativeStatus = serverOrder?.status ?? null;
				if (!authoritativeStatus) {
					try {
						authoritativeStatus = await deps.fetchOrderStatus();
					} catch {
						authoritativeStatus = null;
					}
				}
				const outcome = { kind: 'refused', reason, row: failedRow, order: serverOrder } as const;
				try {
					await deps.mirror(
						{ payment: failedRow, ...(authoritativeStatus ? { status: authoritativeStatus } : {}) },
						{ accepted: false }
					);
				} catch (mirrorError) {
					throw new RecordManualPaymentMirrorError(outcome, mirrorError);
				}
				return outcome;
			}
			if (refusal?.code && isDefinitiveMoneyRefusal(refusal)) {
				// A definitive refusal the server will repeat (conflict, unknown method, bad
				// param): nothing is written — the caller decides.
				throw new RecordManualPaymentError(
					refusal.message ?? refusal.code,
					refusal.code,
					refusal.status
				);
			}
			// No answer, a 5xx, a held lock, a session or proxy answer proves nothing: re-send the
			// same journaled record.
			if (attempt >= RECORD_UNKNOWN_RETRY_DELAYS_MS.length) return { kind: 'unknown', row };
			await (deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
				RECORD_UNKNOWN_RETRY_DELAYS_MS[attempt]
			);
		}

	const serverRow = accepted.payment;
	const serverOrder = accepted.order;
	const outcome = { kind: 'recorded', via: 'online', row: serverRow, order: serverOrder } as const;
	try {
		await deps.mirror(
			{ payment: serverRow, ...(serverOrder ? { status: serverOrder.status } : {}) },
			{ accepted: true }
		);
	} catch (mirrorError) {
		throw new RecordManualPaymentMirrorError(outcome, mirrorError);
	}
	return outcome;
}
