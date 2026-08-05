/**
 * Server line-IDENTITY graft (#818) — the residual duplication window left by
 * #815.
 *
 * WooCommerce keys every order line array by `id` on write: an entry WITHOUT
 * an `id` is APPENDED as a NEW item (`WC_REST_Orders_V2_Controller::
 * prepare_line_items`/`prepare_fee_lines`/`prepare_shipping_lines`/
 * `prepare_coupon_lines` all do `new WC_Order_Item_*( ! empty( $posted['id'] )
 * ? $posted['id'] : '' )`). #815 fixed the SEQUENTIAL case by adopting the
 * acked server document onto the resident — but adoption is deliberately
 * skipped while a later mutation is pending (local intent must win), and queue
 * payloads are FROZEN at enqueue. So an update enqueued while the create was
 * in flight still pushed pre-create, id-less lines and Woo appended them:
 * duplicated items, multiplied totals, real money.
 *
 * This module is the narrow answer: take ONLY the server-assigned `id` off the
 * ack document and graft it onto a local payload, keeping every local value
 * (quantities, prices, meta, edits) exactly as the cashier left it. It is
 * value-blind by construction — nothing but `id` is ever copied.
 *
 * MATCHING KEY: `_woocommerce_pos_uuid` in the LINE's own `meta_data`. Every
 * POS-minted line carries one (`use-add-item-to-order.ts` stamps line_items /
 * fee_lines / shipping_lines; `use-add-coupon.ts` stamps coupon_lines), and it
 * round-trips: WooCommerce returns order-item meta straight off
 * `WC_Order_Item::get_data()` — the internal-key filter
 * (`filter_internal_meta_keys`) applies to ORDER meta only, never to line meta.
 * A create push carries a born-local order, so every one of its lines was
 * authored through those hooks: uuid coverage on the path this bug lives on is
 * total.
 *
 * NO positional / composite fallback, deliberately. A wrong graft is worse
 * than the bug it fixes: an id-less line only APPENDS (visible, recoverable),
 * whereas a mis-grafted id silently REWRITES a different server line. So the
 * graft only ever fires on an UNAMBIGUOUS uuid match — a uuid that appears
 * exactly once locally and exactly once on the server. Known (accepted)
 * failure modes, all of which merely preserve today's behaviour:
 *  - a line with no uuid meta (not reachable from the POS cart hooks) keeps no
 *    id and would still append;
 *  - a duplicated uuid (splitLineItem re-mints clones, so this needs a
 *    hand-edited document) is skipped on both sides;
 *  - `tax_lines` are excluded: WooCommerce recalculates them and the REST
 *    write path does not accept them, so they have no append semantics to fix
 *    (and the POS never stamps them).
 */

const GRAFTABLE_LINE_FIELDS = [
	'line_items',
	'shipping_lines',
	'fee_lines',
	'coupon_lines',
] as const;

/** The per-LINE identity meta the POS cart hooks stamp (same key as the record uuid). */
const LINE_UUID_META_KEY = '_woocommerce_pos_uuid';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A line already carries server identity when `id` is a positive number (or its numeric string). */
function hasServerId(line: Record<string, unknown>): boolean {
	const id = line.id;
	if (typeof id === 'number') return Number.isFinite(id) && id > 0;
	if (typeof id === 'string') return /^\d+$/.test(id.trim()) && Number(id) > 0;
	return false;
}

/**
 * The line's identity uuid, or null when it has none — or more than one. A line
 * carrying two DIFFERENT uuid meta entries is ambiguous about which line it is,
 * and picking the first would be a guess; fail closed instead.
 */
function readLineUuid(line: unknown): string | null {
	if (!isRecord(line) || !Array.isArray(line.meta_data)) return null;
	let found: string | null = null;
	for (const entry of line.meta_data) {
		if (!isRecord(entry) || entry.key !== LINE_UUID_META_KEY) continue;
		if (typeof entry.value !== 'string') continue;
		const uuid = entry.value.trim();
		if (uuid === '') continue;
		if (found !== null && found !== uuid) return null;
		found = uuid;
	}
	return found;
}

/**
 * uuid → the server id it identifies, for uuids that occur EXACTLY once in the
 * array. Ambiguity is recorded as null and never matches — and the OCCURRENCE
 * is what counts, not the usable id: a uuid appearing twice where only one copy
 * carries an id is still ambiguous, because the client cannot tell which of the
 * two server lines it authored.
 */
function serverIdentityIndex(lines: unknown[]): Map<string, number | null> {
	const index = new Map<string, number | null>();
	for (const line of lines) {
		const uuid = readLineUuid(line);
		if (!uuid || !isRecord(line)) continue;
		if (index.has(uuid)) {
			index.set(uuid, null);
			continue;
		}
		const id = typeof line.id === 'number' ? line.id : Number(line.id);
		index.set(uuid, Number.isFinite(id) && id > 0 ? id : null);
	}
	return index;
}

/** uuids appearing exactly once among the local lines — anything else is ambiguous. */
function unambiguousLocalUuids(lines: unknown[]): Set<string> {
	const seen = new Map<string, number>();
	for (const line of lines) {
		const uuid = readLineUuid(line);
		if (uuid) seen.set(uuid, (seen.get(uuid) ?? 0) + 1);
	}
	return new Set([...seen].filter(([, count]) => count === 1).map(([uuid]) => uuid));
}

/**
 * Graft the ack document's server-assigned line ids onto `payload`, matching on
 * the line's `_woocommerce_pos_uuid` meta. Local values are never touched and
 * no server field other than `id` is ever read.
 *
 * @param payload - The local payload (a resident's stored payload, or a frozen queue snapshot).
 * @param document - The server document from the push ack — identity source ONLY.
 * @returns The payload with ids grafted, or the SAME reference when nothing changed.
 */
export function graftServerLineIdentity<T extends Record<string, unknown>>(
	payload: T,
	document: Record<string, unknown> | null | undefined
): T {
	if (!isRecord(document)) return payload;
	let next: Record<string, unknown> = payload;
	for (const field of GRAFTABLE_LINE_FIELDS) {
		const localLines = payload[field];
		const serverLines = document[field];
		if (!Array.isArray(localLines) || !Array.isArray(serverLines)) continue;
		if (localLines.length === 0 || serverLines.length === 0) continue;
		const index = serverIdentityIndex(serverLines);
		if (index.size === 0) continue;
		const local = unambiguousLocalUuids(localLines);
		let changed = false;
		const grafted = localLines.map((line) => {
			if (!isRecord(line) || hasServerId(line)) return line;
			const uuid = readLineUuid(line);
			if (!uuid || !local.has(uuid)) return line;
			const id = index.get(uuid);
			if (typeof id !== 'number') return line;
			changed = true;
			return { ...line, id };
		});
		if (changed) next = { ...next, [field]: grafted };
	}
	return next as T;
}
