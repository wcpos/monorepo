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
/** A 4xx status that is the session's, the proxy's or the rate limiter's: re-send it. */
export const RESENDABLE_MONEY_STATUSES: readonly number[] = [401, 403, 408, 426, 429];

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

/** Whether the answer settles the command (the server decided; a re-send repeats it). */
export function isDefinitiveMoneyRefusal(refusal: MoneyRefusal | null): boolean {
	if (!refusal?.code || refusal.status === undefined) return false;
	if (refusal.status < 400 || refusal.status >= 500) return false;
	if (RESENDABLE_MONEY_CODES.includes(refusal.code)) return false;
	// A 403 that names a contract code is the store's decision, not a session wall: the store
	// refuses a disabled method with 403 `wcpos_payment_method_disabled` on submit and on record
	// (free `Payments/Contract/Gateway_Submission.php:101`, `Ledger.php:843`), and a re-send
	// would be refused the same way for ever. WordPress's own 403s (`rest_forbidden`) stay.
	if (refusal.status === 403 && refusal.code.startsWith('wcpos_')) return true;
	return !RESENDABLE_MONEY_STATUSES.includes(refusal.status);
}
