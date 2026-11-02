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

/**
 * The statuses a till may push (ADR 0040 D4). The server answers any other with
 * 422 `wcpos_status_not_pushable` for the whole push, and a pushable status that
 * differs from a paid order's is a reopen. A wire fact, so it lives beside the strip.
 */
export const PUSHABLE_ORDER_STATUSES = ['pos-open', 'pending', 'on-hold', 'cancelled'] as const;
export type PushableOrderStatus = (typeof PUSHABLE_ORDER_STATUSES)[number];

/**
 * Order fields and meta the server owns under ADR 0040 rule 2: it derives paid from
 * its own payment rows and drops these from a push. Mirrors
 * `Pos_Order_Audit::SERVER_MONEY_FIELDS` / `SERVER_MONEY_META_KEYS`; a new key joins
 * both in one change.
 */
export const SERVER_OWNED_ORDER_FIELDS: readonly string[] = [
	'set_paid',
	'date_paid',
	'date_paid_gmt',
	'transaction_id',
	'payment_method',
	'payment_method_title',
];
export const SERVER_OWNED_ORDER_META_KEYS: readonly string[] = [
	'_wcpos_payments',
	'_wcpos_payment_method',
	'_wcpos_payment_id',
	'_wcpos_payment_live',
	'_wcpos_commands',
	'_wcpos_completed_at',
	'_wcpos_completions',
	'_wcpos_fiscal_pending',
	'_wcpos_gateway_attempts',
	'_wcpos_awaiting_customer',
	'_payment_method',
	'_payment_method_title',
	'_transaction_id',
	'_date_paid',
	'_paid_date',
];

/** Never on the wire. `date_modified_gmt` is a readonly revision stamp, not a claim. */
const NOT_ASSERTED = new Set<string>([
	...SERVER_AUTHORED_ORDER_MONEY_FIELDS,
	...SERVER_OWNED_ORDER_FIELDS,
]);
const SERVER_OWNED_META = new Set<string>(SERVER_OWNED_ORDER_META_KEYS);

/** The server normalises a `wc-` prefix before it checks the status. */
export function isPushableOrderStatus(status: unknown): status is PushableOrderStatus {
	if (typeof status !== 'string') return false;
	const bare = status.startsWith('wc-') ? status.slice(3) : status;
	return (PUSHABLE_ORDER_STATUSES as readonly string[]).includes(bare);
}

type MetaEntry = { key?: unknown; value?: unknown } | null;
const isServerOwnedMeta = (entry: MetaEntry) => SERVER_OWNED_META.has(String(entry?.key));

/**
 * The payload an order push may carry: no server-authored aggregate, no server-owned
 * field or meta entry, and no status the server would refuse.
 *
 * @returns The SAME reference when there was nothing to drop.
 */
export function toOrderWirePayload<T extends Record<string, unknown>>(payload: T): T {
	const meta = Array.isArray(payload.meta_data) ? (payload.meta_data as MetaEntry[]) : null;
	const dropsMeta = meta?.some(isServerOwnedMeta) ?? false;
	const dropsStatus = 'status' in payload && !isPushableOrderStatus(payload.status);
	if (!dropsMeta && !dropsStatus && !Object.keys(payload).some((key) => NOT_ASSERTED.has(key)))
		return payload;
	const wire: Record<string, unknown> = Object.fromEntries(
		Object.entries(payload).filter(
			([key]) => !NOT_ASSERTED.has(key) && !(key === 'status' && dropsStatus)
		)
	);
	if (meta && dropsMeta) wire.meta_data = meta.filter((entry) => !isServerOwnedMeta(entry));
	return wire as T;
}

const tillOwnedMeta = (meta: unknown): string =>
	JSON.stringify(
		(Array.isArray(meta) ? (meta as MetaEntry[]) : [])
			.filter((entry) => !isServerOwnedMeta(entry))
			.map((entry) => [entry?.key, entry?.value])
	);

/**
 * Does this set of order changes assert anything the server will act on?
 *
 * False when every changed key is server-authored or server-owned, the revision
 * stamp, a status the server refuses or the one `current` already holds, or a
 * `meta_data` array whose till-owned entries equal `current`'s (by key and value).
 * Such changes are still applied to the local record; they are just not sent.
 */
export function orderChangesAssertIntent(
	changes: Record<string, unknown>,
	current?: Record<string, unknown>
): boolean {
	return Object.entries(changes).some(([key, value]) => {
		if (NOT_ASSERTED.has(key) || key === 'date_modified_gmt') return false;
		if (key === 'status') return isPushableOrderStatus(value) && value !== current?.status;
		if (key === 'meta_data') return tillOwnedMeta(value) !== tillOwnedMeta(current?.meta_data);
		return true;
	});
}
