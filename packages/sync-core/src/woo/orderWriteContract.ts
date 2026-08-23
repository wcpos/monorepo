/**
 * What a WooCommerce order write may actually assert.
 *
 * ADR 0032 — "WooCommerce owns money, the POS owns intent" — states the
 * ownership rule. This module states the WIRE consequence of it, in one place,
 * so the enqueue pipeline and the callers that decide whether a write is worth
 * enqueueing cannot drift apart.
 *
 * The order aggregate is declared `'readonly' => true` in the wc/v3 order
 * schema, and `filter_writable_props()` drops every readonly prop before
 * `prepare_object_for_database()` sets anything
 * (`Version2/class-wc-rest-orders-v2-controller.php:704-719`, verified against
 * WooCommerce 10.4.3). The server then recomputes the aggregate from the lines
 * on any items-bearing update (`calculate_totals( true )` in `save_object()`).
 *
 * That is the path POS orders actually take: the client pushes to
 * `wcpos/v2/push/orders` and `API\V2\Write_Controller::dispatch_write()`
 * forwards the mutation into the stock wc/v3 controller via `rest_do_request()`.
 * `Sync\Order_Write_Payload`, which shapes the forwarded body, names no money
 * field at all — so an aggregate the POS puts in a push body is discarded
 * unread, on every route it can take.
 *
 * Removing it client-side is therefore a server-side NO-OP. What it buys is on
 * the client:
 *
 *  - a money-only settlement stops minting a request that accomplishes nothing;
 *  - the pushed-vs-ack money comparison (`compareOrderMoney`) narrows to the
 *    fields the POS genuinely asserts — line-level `subtotal`/`total` — instead
 *    of manufacturing a divergence out of an aggregate the server was always
 *    going to overwrite.
 *
 * The aggregate is still COMPUTED and still written to the local record: it is
 * what the cart displays and what an offline till runs on (ADR 0032 §4). It
 * simply stops being an assertion made to the server.
 */

/**
 * The order-level money WooCommerce authors and the POS may not.
 *
 * The seven scalars are `readonly` individually
 * (`Version2/class-wc-rest-orders-v2-controller.php:1226-1266`); `tax_lines` is
 * `readonly` at the ARRAY level (`ibid.:1653-1657`), so the whole array goes.
 *
 * Deliberately NOT here: line-level money. `line_items[].subtotal`/`.total`,
 * `shipping_lines[].total` and `fee_lines[].total` are writable, the server
 * keeps them, and they are the POS's actual assertion — the one the divergence
 * comparison exists to check.
 */
export const SERVER_AUTHORED_ORDER_MONEY_FIELDS = [
	'discount_total',
	'discount_tax',
	'shipping_total',
	'shipping_tax',
	'cart_tax',
	'total',
	'total_tax',
	'tax_lines',
] as const;

const SERVER_AUTHORED = new Set<string>(SERVER_AUTHORED_ORDER_MONEY_FIELDS);

/**
 * A revision stamp, not a claim. `date_modified_gmt` is `readonly` in the same
 * schema, rides along on every local patch, and asserting it alone is not a
 * reason to spend a request.
 */
const NOT_AN_ASSERTION = new Set<string>(['date_modified_gmt']);

/**
 * Drop the server-authored aggregate from an outbound order payload.
 *
 * @returns The payload without those fields — the SAME reference when it
 *   carried none of them.
 */
export function stripServerAuthoredOrderMoney<T extends Record<string, unknown>>(payload: T): T {
	const present = Object.keys(payload).some((key) => SERVER_AUTHORED.has(key));
	if (!present) return payload;
	return Object.fromEntries(
		Object.entries(payload).filter(([key]) => !SERVER_AUTHORED.has(key))
	) as T;
}

/**
 * Does this set of order changes assert anything the server will act on?
 *
 * False for a pure money settlement: every field it writes is server-authored,
 * so enqueueing it would cost a push whose body the server discards unread —
 * and whose ack would then be compared against a payload asserting nothing.
 * The changes are still applied to the local record; they are just not sent.
 */
export function orderChangesAssertIntent(changes: Record<string, unknown>): boolean {
	return Object.keys(changes).some(
		(key) => !SERVER_AUTHORED.has(key) && !NOT_AN_ASSERTION.has(key)
	);
}
