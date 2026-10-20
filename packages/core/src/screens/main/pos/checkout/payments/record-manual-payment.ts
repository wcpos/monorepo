import { v4 as uuidv4 } from 'uuid';

import { MoneyCommandError, type OrderApproval } from '@wcpos/query';
import { derive, mintManualPayment, readLedger, toMinor } from '@wcpos/order-math';
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
 * journaled money command and the server's copy is mirrored back; offline it is refused
 * until ADR 0040 PR B queues it. Pure apart from the injected deps so the decision tree is testable.
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
	/** The order's total and currency as the cashier approved them at the press (ADR 0040). */
	approval?: OrderApproval;
}
export interface RecordManualPaymentDeps {
	post: (url: string, body: unknown) => Promise<{ data: unknown }>;
	isOnline: () => boolean;
	cashierId: number;
	storeId: number | null;
	registerId: string | null;
	sessionId?: string | null;
	persistProvenance?: () => Promise<void>;
	currency: string;
	dp: number;
	sleep?: (ms: number) => Promise<void>;
	/** Mirror the answered row onto the latest resident (never a pre-command snapshot). */
	mirror: (
		answer: { payment: PaymentRow; status?: string },
		options: { accepted: boolean }
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
type RefusalReason = 'order_already_paid' | 'amount_exceeds_balance';
export type RecordManualPaymentOutcome =
	| {
			kind: 'recorded';
			via: 'online' | 'offline';
			row: PaymentRow;
			order: OrderPaymentSummary | null;
	  }
	| { kind: 'refused'; reason: RefusalReason; row: PaymentRow; order: OrderPaymentSummary | null }
	| { kind: 'failed'; reason: 'provenance_save_failed' | 'offline_unavailable' }
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

type ErrorResponse = {
	status?: number;
	data?: {
		code?: string;
		message?: string;
		data?: { payment?: PaymentRow; order?: OrderPaymentSummary };
	};
};

function errorResponse(error: unknown): ErrorResponse | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const response = (error as { response?: unknown }).response;
	return response && typeof response === 'object' ? (response as ErrorResponse) : undefined;
}

function refusalReason(code: string | undefined): RefusalReason | null {
	if (code === 'wcpos_order_already_paid') return 'order_already_paid';
	if (code === 'wcpos_amount_exceeds_balance') return 'amount_exceeds_balance';
	return null;
}

export async function recordManualPayment(
	order: RecordManualPaymentOrder,
	method: PaymentMethodDescriptor,
	input: RecordManualPaymentInput,
	deps: RecordManualPaymentDeps
): Promise<RecordManualPaymentOutcome> {
	const online = deps.isOnline() && Number.isInteger(order.id) && Number(order.id) > 0;
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
	// ADR 0040 PR A: a tender the server cannot hear is refused; PR B queues it as a command.
	if (!online) return { kind: 'failed', reason: 'offline_unavailable' };

	const { balance } = derive(order.total, readLedger(order.meta_data), [method], { dp: deps.dp });
	if (toMinor(minted.row.amount, deps.dp) === toMinor(balance, deps.dp)) {
		try {
			await deps.persistProvenance?.();
		} catch {
			return { kind: 'failed', reason: 'provenance_save_failed' };
		}
	}

	// Only the request is inside the try: once the server has answered 2xx the row is
	// recorded, and a failure while mirroring it locally must surface as that failure —
	// never as a re-send, which the journal already holds for Try again.
	// Every attempt is the same call: the poster re-sends the journaled record for this row id,
	// its frozen body and identity, and the server replays a row it already stored.
	let accepted: { payment?: PaymentRow; order?: OrderPaymentSummary } | undefined;
	for (let attempt = 0; !accepted; attempt++)
		try {
			const response = await deps.post(`orders/${order.id}/payments`, { payment: minted.row });
			accepted = (response.data ?? {}) as { payment?: PaymentRow; order?: OrderPaymentSummary };
		} catch (error) {
			// Refused before it left the till (no revision, or the order changed): nothing was sent.
			if (error instanceof MoneyCommandError) throw error;
			const response = errorResponse(error);
			const reason = refusalReason(response?.data?.code);
			if (reason) {
				// The server STORED the refused row as `failed`; put the order in front of the
				// cashier independently, then mirror the server's copy into the ledger.
				const failedRow = response?.data?.data?.payment ?? {
					...minted.row,
					status: 'failed',
					failure_reason: reason,
				};
				const serverOrder = response?.data?.data?.order ?? null;
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
			const status = response?.status;
			const code = response?.data?.code;
			// No answer, a 5xx or a held lock proves nothing: re-send the same journaled record.
			if (!response || (status !== undefined && status >= 500) || code === 'wcpos_payment_locked') {
				if (attempt >= RECORD_UNKNOWN_RETRY_DELAYS_MS.length)
					return { kind: 'unknown', row: minted.row };
				await (deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(
					RECORD_UNKNOWN_RETRY_DELAYS_MS[attempt]
				);
				continue;
			}
			if (code && status !== undefined && status >= 400 && status < 500) {
				// A definitive refusal the server will repeat (conflict, unknown method, bad
				// param): nothing is written — the caller decides.
				throw new RecordManualPaymentError(response?.data?.message ?? code, code, status);
			}
			throw error;
		}

	const serverRow = accepted.payment ?? minted.row;
	const serverOrder = accepted.order ?? null;
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
