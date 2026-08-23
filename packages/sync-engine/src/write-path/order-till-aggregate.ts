/**
 * The till's own aggregate for an order about to be pushed — the CASHIER'S
 * side of the save-time mirror check.
 *
 * #1507 took the order aggregate off the wire: it is `readonly` in the wc/v3
 * schema and WooCommerce recomputes it from the lines, so sending it was a
 * request body the server discarded unread. What that must NOT take away is
 * the answer to the only question the mirror check exists to answer — *"the
 * store recorded a different total from the one I just charged."* `total` is
 * the number the cashier said out loud, took payment for and printed; a mirror
 * check that has stopped watching it is not a mirror check.
 *
 * So the expectation travels WITH the push instead of IN it. It is read from
 * the freshest resident at the moment of the push — the same seam, and the
 * same argument, as `withGraftedLineIdentity`: nothing landing afterwards can
 * outrun it. It has to be captured then and not at ack time, because ack
 * adoption runs first and overwrites the resident's money with the server's.
 *
 * ── The consistency guard, and why skipping is safe ─────────────────────────
 *
 * The aggregate is a pure function of the lines (`settleAggregate`), so it only
 * speaks for the lines it was settled over. Two conditions, both necessary:
 *
 *  - the push must CARRY at least one line array. WooCommerce recalculates only
 *    when the request does (`calculate_totals( true )` in `save_object()`), so
 *    on a status-only or note-only push the ack just echoes stored money that
 *    answers an older write — comparing it would report a divergence that never
 *    happened.
 *  - every line array the push carries must still EQUAL the resident's. If a
 *    cart edit overtook this push, the resident's aggregate was settled over
 *    different lines than the ones being sent, and the two are not comparable.
 *
 * Skipping is safe — and this is the load-bearing claim, because a skip means
 * the cashier is NOT told: every line change goes through `localPatch`, which
 * enqueues (only a PURE-money patch is suppressed, and money does not move the
 * lines). So lines that have moved past this push always have a mutation of
 * their own still to come, and that push carries a consistent pair. The check
 * is deferred to it, never dropped.
 */

import { SERVER_AUTHORED_ORDER_MONEY_FIELDS } from '@wcpos/sync-core';

/** The line arrays whose contents determine the aggregate. */
const LINE_ARRAYS = ['line_items', 'fee_lines', 'shipping_lines', 'coupon_lines'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * JSON with recursively sorted object keys.
 *
 * Plain `JSON.stringify` would make this guard depend on key INSERTION ORDER,
 * which is not a fact about the data: the queue row and the resident row take
 * different routes through RxDB storage, and a re-ordered key would read as
 * "the lines moved" and silence the cashier's alarm for no reason.
 */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (isRecord(value)) {
		return `{${Object.keys(value)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/**
 * The aggregate the till holds for this order, or null when it cannot be
 * compared against this push (see the guard in the module docblock).
 *
 * @param pushedPayload - The payload as it is going on the wire, AFTER the
 *   line-identity graft — so its line ids already match the resident's and a
 *   pending graft cannot read as a moved line.
 * @param residentPayload - The record's payload at the moment of the push.
 */
export function tillAggregateFor(
	pushedPayload: Record<string, unknown>,
	residentPayload: Record<string, unknown>
): Record<string, unknown> | null {
	if (!isRecord(pushedPayload) || !isRecord(residentPayload)) return null;

	const carried = LINE_ARRAYS.filter((name) => Array.isArray(pushedPayload[name]));
	if (carried.length === 0) return null;
	for (const name of carried) {
		if (canonical(pushedPayload[name]) !== canonical(residentPayload[name])) return null;
	}

	const aggregate: Record<string, unknown> = {};
	for (const field of SERVER_AUTHORED_ORDER_MONEY_FIELDS) {
		const value = residentPayload[field];
		if (value !== undefined) aggregate[field] = value;
	}
	return Object.keys(aggregate).length === 0 ? null : aggregate;
}
