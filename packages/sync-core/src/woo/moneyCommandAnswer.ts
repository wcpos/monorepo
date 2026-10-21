/**
 * How the till reads a money command's answer (ADR 0040 §1.3 step 6): one home for the rule,
 * so the envelope's journal, the close, the cash record and PR B's queue adapter cannot drift.
 *
 * A JSON WordPress error with a 4xx status is the server's decision on this command, and a
 * re-send would repeat it: the command is settled (its journal entry deleted). The exceptions
 * are the answers that say nothing about the command itself: the order lock was held and nothing
 * ran, the revision was stale, or the session, the proxy or the rate limiter answered for the
 * store. Those, every 5xx, a network failure and a non-JSON body are not definitive: the entry
 * stays, and the only resolution is a re-send, which the server replays or runs once.
 */

/** A 4xx code that is not the server's decision on the command: re-send it. */
export const RESENDABLE_MONEY_CODES: readonly string[] = [
	'wcpos_payment_locked',
	'wcpos_revision_stale',
];
/**
 * A 4xx status that is the session's, the proxy's or the rate limiter's: re-send it. 407 is an
 * authenticating proxy (the terminal leg reads it the same way, `server-leg.ts` INTENT_REFUSAL).
 */
export const RESENDABLE_MONEY_STATUSES: readonly number[] = [401, 403, 407, 408, 426, 429];
/**
 * The 5xx answers the store documents as its own decision with no money moved, so a re-send
 * cannot take money and the journal must let the cashier move on. Free `next`
 * `Payments/Contract/Gateway_Submission.php`: 501 `wcpos_capture_mode_unsupported` is answered
 * before anything runs (:54); 502 `wcpos_provider_error` is the gateway's own refusal, after
 * which the store restores the previous method, marks the attempt `cancelled` and forgets the
 * command (`restore_method`, :266-281, :517-530), so a re-send of it is refused 409
 * `wcpos_payment_conflict` (:87). The one exception the server names, a gateway that throws
 * AFTER dispatch, leaves its attempt `sent` (:266) behind the same 502; a re-send would only
 * replay that `sent`, and the store's log names the attempt for the operator.
 */
export const DEFINITIVE_SERVER_ERROR_CODES: readonly string[] = [
	'wcpos_capture_mode_unsupported',
	'wcpos_provider_error',
];

/** Refusals for which the server STORED the record as a `failed` row, and what they mean. */
export const PAYMENT_ROW_REFUSALS = {
	wcpos_order_already_paid: 'order_already_paid',
	wcpos_amount_exceeds_balance: 'amount_exceeds_balance',
} as const;
export type PaymentRowRefusal = (typeof PAYMENT_ROW_REFUSALS)[keyof typeof PAYMENT_ROW_REFUSALS];

/** The named answers a caller branches on. */
export const MONEY_ANSWER_CODES = {
	revisionStale: 'wcpos_revision_stale',
	paymentLocked: 'wcpos_payment_locked',
	balanceOutstanding: 'wcpos_balance_outstanding',
	fieldsInvalid: 'wcpos_fields_invalid',
	moneyInMotion: 'wcpos_money_in_motion',
} as const;

export interface MoneyRefusal {
	readonly status: number | undefined;
	/** Set only when the body is a JSON WordPress error. */
	readonly code?: string;
	readonly message?: string;
	readonly data?: Record<string, unknown>;
}

/** The refusal an HTTP client error carries, or null when no response arrived (network). */
export function moneyRefusalOf(error: unknown): MoneyRefusal | null {
	const response = (error as { response?: unknown } | null | undefined)?.response;
	if (!response || typeof response !== 'object') return null;
	const { status, data: body } = response as { status?: unknown; data?: unknown };
	const refusal = { status: typeof status === 'number' ? status : undefined };
	if (!body || typeof body !== 'object') return refusal;
	const { code, message, data } = body as { code?: unknown; message?: unknown; data?: unknown };
	if (typeof code !== 'string') return refusal;
	return {
		...refusal,
		code,
		...(typeof message === 'string' ? { message } : {}),
		...(data && typeof data === 'object' ? { data: data as Record<string, unknown> } : {}),
	};
}

/** The store's answer to a `close` that completed the sale. */
export interface CloseAnswer {
	readonly order: { readonly status: string } & Record<string, unknown>;
	/** null: the sale is paid but its completion stamp could not persist (server SPEC §4.3). */
	readonly completion: { readonly n: number; readonly id: string } | null;
}

/**
 * Statuses that are not a paid sale: the open POS carts, an unpaid or failed order, and an order
 * that is gone. The client's own paid rule is this blocklist too (core `sale-completion.ts`,
 * `UNPAID_STATUSES`): any other status, on-hold and a merchant's custom paid status included,
 * is a sale the store completed.
 */
const UNPAID_CLOSE_STATUSES: readonly string[] = [
	'pos-open',
	'pos-partial',
	'pending',
	'failed',
	'cancelled',
	'refunded',
	'trash',
];

/**
 * Whether a 2xx `close` answer is the store's own (ADR 0040 D2): a summary with a status and the
 * completion it stamped. A paid summary with `completion: null` is a close whose stamp could not
 * persist (server SPEC §4.3; a replay after a crash between its two saves answers the same,
 * `API/V2/Payments_Controller.php:452-468`): the sale is completed, with no completion number
 * (the receipt prints none). Anything else, `completion: null` on an open summary included, a
 * proxy page or a plugin filter's `{}`, proves nothing: it never settles the journaled close or
 * finishes the sale, and the close is re-sent. One rule for the first answer, Try again and the
 * store-session recovery.
 */
export function isCloseAnswer(data: unknown): data is CloseAnswer {
	const { order, completion } = (data ?? {}) as { order?: unknown; completion?: unknown };
	if (!order || typeof order !== 'object') return false;
	const status = (order as { status?: unknown }).status;
	if (typeof status !== 'string') return false;
	if (completion === null) return !UNPAID_CLOSE_STATUSES.includes(status);
	return (
		!!completion &&
		typeof completion === 'object' &&
		typeof (completion as { n?: unknown }).n === 'number' &&
		typeof (completion as { id?: unknown }).id === 'string'
	);
}

/** What a gateway `submit` can answer, first time or replayed. */
export const SUBMIT_OUTCOMES: readonly string[] = ['sent', 'settled', 'recorded', 'paid'];

const isObject = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object';
/** A ledger row as the store puts it on the wire (`Ledger::to_wire`). */
const isRow = (value: unknown) =>
	isObject(value) &&
	typeof value.id === 'string' &&
	typeof value.status === 'string' &&
	typeof value.amount === 'string';
/** The order summary (`Ledger::summary`): its status says what the order is now. */
const isSummary = (value: unknown) => isObject(value) && typeof value.status === 'string';

/**
 * Whether a 2xx answer to a money command is the store's own, by kind (free `next`
 * `API/V2/Payments_Controller.php`): `record`, `intent`, `capture` and `void` answer the row and
 * the summary (`payment_response`, :174, :297, :370, and their replays, :475-478); `refund`
 * answers the row alone (:368, :475); `submit` answers a known `outcome` with the summary (and
 * the row for `recorded`), `cancel`
 * the summary (:451); `close` as `isCloseAnswer`. Anything else (a proxy page, a plugin filter's
 * `{}`) proves nothing: it never settles the command and never stands in for a row the store did
 * not send. The command stays journaled and its outcome is unknown until a re-send answers it.
 */
export function isMoneyAnswer(
	kind: 'record' | 'intent' | 'capture' | 'void' | 'refund' | 'submit' | 'cancel' | 'close',
	data: unknown
): boolean {
	if (!isObject(data)) return false;
	switch (kind) {
		case 'close':
			return isCloseAnswer(data);
		case 'refund':
			return isRow(data.payment);
		case 'submit':
			// The server's vocabulary (`Gateway_Submission.php:71, 77-83, 370`): `recorded` carries
			// the row it recorded; `sent`, `settled` and a replayed `paid` the summary alone.
			if (!SUBMIT_OUTCOMES.includes(data.outcome as string) || !isSummary(data.order)) return false;
			return data.outcome !== 'recorded' || isRow(data.payment);
		case 'cancel':
			return isSummary(data.order);
		default:
			return isRow(data.payment) && isSummary(data.order);
	}
}

/** Whether the answer settles the command (the server decided; a re-send repeats it). */
export function isDefinitiveMoneyRefusal(refusal: MoneyRefusal | null): boolean {
	if (!refusal?.code || refusal.status === undefined) return false;
	if (refusal.status >= 500) return DEFINITIVE_SERVER_ERROR_CODES.includes(refusal.code);
	if (refusal.status < 400) return false;
	if (RESENDABLE_MONEY_CODES.includes(refusal.code)) return false;
	// A 403 that names a contract code is the store's decision, not a session wall: the store
	// refuses a disabled method with 403 `wcpos_payment_method_disabled` on submit and on record
	// (free `Payments/Contract/Gateway_Submission.php:101`, `Ledger.php:843`), and a re-send
	// would be refused the same way for ever. WordPress's own 403s (`rest_forbidden`) stay.
	if (refusal.status === 403 && refusal.code.startsWith('wcpos_')) return true;
	return !RESENDABLE_MONEY_STATUSES.includes(refusal.status);
}
