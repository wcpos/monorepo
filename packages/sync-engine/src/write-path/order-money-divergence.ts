/**
 * Order-money divergence (R1) — the client half of the mirror contract.
 *
 * The ruling: WooCommerce's calculation is the SOURCE OF TRUTH and the POS
 * mirrors it exactly. So when the POS pushes an order IT BUILT and the server's
 * ack comes back holding different money, the mirror is broken and the cashier
 * has to be told before goods leave the counter. That is a save-time check and
 * ONLY a save-time check: payment-time adjustments (gateway surcharges, fee
 * plugins — 45.00 becoming 50.07 during checkout is a real, legitimate case)
 * happen server-side AFTER this ack and arrive through a PULL, never through a
 * push ack. Nothing here can see them, which is exactly right.
 *
 * ── What is compared ────────────────────────────────────────────────────────
 * The PUSHED ENVELOPE PAYLOAD against the ACK DOCUMENT. Deliberately not the
 * resident: the resident moves while a push is in flight (coupon replay, a fee
 * recalculation, the cart's own totals re-patch), so resident-vs-ack would
 * false-positive on ordinary cart activity and would race the very hook whose
 * loop it is supposed to stay out of. Pushed-vs-ack asks one question with one
 * answer — "did the server keep the money I sent it?" — and the answer does not
 * change with time.
 *
 * ── At what precision ───────────────────────────────────────────────────────
 * At the width `equivalenceDecimals` picks — the ack's own width when it is
 * narrower than the POS value (floored at cents), the wider of the two
 * otherwise, capped at six.
 *
 * The naive reading of "the server now serves six decimals" (woocommerce-pos
 * #1466, live on dev-next) would be to compare everything at six. That is
 * wrong, because a six-decimal STRING is not a six-decimal VALUE. WooCommerce
 * stores its money per field, and the POS mirrors that field for field:
 *
 *   6dp, genuinely — `cart_tax` / `shipping_tax` (WC sums per-rate taxes at
 *   full precision), and every LINE value (`WC_Order_Item::set_total` formats
 *   with no `dp` argument). Live: `cart_tax 9.163636`, line total `40.909091`.
 *
 *   2dp, then PADDED to six — order-level `total` above all
 *   (`WC_Abstract_Order::set_total` runs `wc_format_decimal($v,
 *   wc_get_price_decimals())`, so the stored value is already cents; `dp=6`
 *   only widens the string). Live: `50.070000`. Same for `total_tax`,
 *   `discount_total` / `discount_tax`, `shipping_total` and `tax_lines[]`,
 *   all of which pass through `wc_round_tax_total` / `NumberUtil::round` at
 *   display decimals first. `order-totals.ts` reproduces each of these
 *   exactly, which is why both sides agree field for field.
 *
 * Deriving the width from the two spellings is what makes that safe without a
 * table of field names to keep in sync with WooCommerce: `36.68` vs
 * `36.680000` is one number and `36.68` vs `50.070000` is two, and neither
 * fact had to be declared. It also absorbs VERSION SKEW — a till running
 * against a store that has not taken the plugin fix yet still sees `"6.71"`
 * for a 6dp `cart_tax`, and tolerating that narrower rendering keeps it
 * correctly silent instead of alerting on every taxed sale.
 *
 * `ORDER_MONEY_PRECISION_MODE` selects between that and the legacy rule
 * (`server-precision`: trust the ack's own width, whatever it is). Both are
 * pinned by tests.
 *
 * Rounding is done on the DIGITS of the decimal string, half-up away from zero
 * (PHP `round()` / `wc_format_decimal` semantics). No float ever touches the
 * value, so the classic midpoint trap — 1.005 is really 1.00499999999999989 in
 * binary — cannot flip a comparison and mint a phantom divergence.
 */

import { pairLinesByUuid } from './graft-server-line-identity';

/** How strictly the ack's money is held to the POS's math. */
export type MoneyPrecisionMode = 'server-precision' | 'exact-6dp';

/**
 * The active mode.
 *
 * `exact-6dp` since woocommerce-pos#1466 pinned `dp=6` across
 * `Order_Serializer::serialize_order`, `Catalog_Proxy_Controller::proxy` and
 * `Write_Controller::document_for` — merged and live-verified on dev-next, where
 * a param-less v2 order read now returns `cart_tax 9.163636` and line totals at
 * `40.909091`. That closes the client half of #946: sub-cent tax components
 * survive the write path and are now COMPARED rather than rounded away.
 *
 * `server-precision` is retained as the legacy rule, not as dead code: it is the
 * behaviour to fall back to if the six-decimal guarantee ever has to be walked
 * back server-side. Both modes stay pinned by tests.
 *
 * Note what this flip did NOT need: a per-field table of which money
 * WooCommerce stores at display decimals. Comparing at the narrower of the two
 * representations (see the module docblock) derives that from the values
 * themselves, so a store on an older plugin — still serving `"6.71"` where the
 * POS holds `6.71328` — stays correctly silent instead of alerting on every
 * taxed sale.
 */
export const ORDER_MONEY_PRECISION_MODE: MoneyPrecisionMode = 'exact-6dp';

/** The ceiling `exact-6dp` compares at — 1.9's dp=6 money contract. */
export const EXACT_COMPARISON_DECIMALS = 6;

/** Order-level monetary fields, in the order a cashier reads them. */
const ORDER_MONEY_FIELDS = [
	'total',
	'total_tax',
	'cart_tax',
	'discount_total',
	'discount_tax',
	'shipping_total',
	'shipping_tax',
] as const;

/** Line arrays whose entries the POS authors and stamps with a line uuid. */
const LINE_ARRAYS = ['line_items', 'fee_lines', 'shipping_lines', 'coupon_lines'] as const;

/** Monetary keys that may appear on a line, across all four line shapes. */
const LINE_MONEY_KEYS = [
	'subtotal',
	'subtotal_tax',
	'total',
	'total_tax',
	'discount',
	'discount_tax',
] as const;

/** Monetary keys on a line's nested `taxes[]` entry (paired by rate `id`). */
const LINE_TAX_KEYS = ['total', 'subtotal'] as const;

/** Monetary keys on an order's `tax_lines[]` entry (paired by `rate_id`). */
const TAX_LINE_KEYS = ['tax_total', 'shipping_tax_total'] as const;

export type MoneyDivergenceField = {
	/** Dotted path inside the order payload, e.g. `line_items[<uuid>].total_tax`. */
	field: string;
	/** The POS value, as compared (rounded to `decimals` when that was possible). */
	expected: string;
	/** The server value, as compared. */
	got: string;
	/** Decimals the comparison ran at; `null` when a value could not be parsed. */
	decimals: number | null;
};

export type OrderMoneyDivergence = {
	mode: MoneyPrecisionMode;
	fields: MoneyDivergenceField[];
};

type Line = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A plain decimal literal — no exponent, no separators, no currency symbol. */
const DECIMAL_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Expand an exponent-form decimal (`1e-7`, `1.5E+3`) into plain notation.
 *
 * `String(number)` switches to exponent form below 1e-6 and at/above 1e21, and a
 * payload MAY carry money numerically. Without this the value reads as
 * unparseable and the comparator reports a divergence between two identical
 * numbers — a false alert, the one failure mode this feature cannot afford.
 *
 * @returns The plain decimal string, or null when `value` is not exponent form.
 */
function expandExponent(value: string): string | null {
	const match = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(value);
	if (!match) return null;
	const [, sign = '', intPart = '', fracPart = '', rawExponent = '0'] = match;
	const exponent = Number(rawExponent);
	const digits = intPart + fracPart;
	// Where the decimal point lands once the exponent is applied.
	const pointAt = intPart.length + exponent;
	if (pointAt <= 0) return `${sign}0.${'0'.repeat(-pointAt)}${digits}`;
	if (pointAt >= digits.length) return `${sign}${digits}${'0'.repeat(pointAt - digits.length)}`;
	return `${sign}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;
}

/**
 * A monetary value as a plain decimal STRING, or null when the slot holds
 * nothing to compare. An empty string is Woo's "unset", not a zero, so it reads
 * as absent. Numbers are accepted (some payload shapes carry `price`
 * numerically) and expanded out of exponent form.
 */
function moneyString(value: unknown): string | null {
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null;
		const rendered = String(value);
		return expandExponent(rendered) ?? rendered;
	}
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (trimmed === '') return null;
	return expandExponent(trimmed) ?? trimmed;
}

/** Decimal places carried by a decimal string, or null when it is not one. */
function decimalsOf(value: string): number | null {
	if (!DECIMAL_LITERAL.test(value)) return null;
	const dot = value.indexOf('.');
	return dot === -1 ? 0 : value.length - dot - 1;
}

/** Add one to a string of digits, carrying left (`999` → `1000`). */
function incrementDigits(digits: string): string {
	const out = digits.split('');
	for (let index = out.length - 1; index >= 0; index -= 1) {
		if (out[index] === '9') {
			out[index] = '0';
			continue;
		}
		out[index] = String(Number(out[index]) + 1);
		return out.join('');
	}
	return `1${out.join('')}`;
}

/**
 * Round a decimal STRING to `decimals` places, half-up away from zero, without
 * ever converting to a float.
 *
 * @param value - A plain decimal literal (`'-0.719280'`, `'5'`, `'.5'`).
 * @param decimals - Target decimal places (0-20).
 * @returns The rounded, zero-padded canonical string, or null when `value` is
 *   not a decimal literal — a caller must decide what an unparseable value
 *   means rather than receive a guessed number.
 */
export function roundDecimalString(value: string, decimals: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!DECIMAL_LITERAL.test(trimmed)) return null;
	// The bound only exists to stop a pathological `'0'.repeat()`; it is far above
	// any width a store can configure, so no real ack can be refused by it.
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > 100) return null;

	const negative = trimmed.startsWith('-');
	const unsigned = negative || trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
	const dot = unsigned.indexOf('.');
	const rawInt = dot === -1 ? unsigned : unsigned.slice(0, dot);
	const rawFrac = dot === -1 ? '' : unsigned.slice(dot + 1);

	let digits = (rawInt === '' ? '0' : rawInt) + rawFrac.slice(0, decimals).padEnd(decimals, '0');
	const nextDigit = rawFrac[decimals];
	if (nextDigit !== undefined && nextDigit >= '5') digits = incrementDigits(digits);

	const cut = digits.length - decimals;
	// Strip leading zeros but never the last digit (`050` → `0`, `1000` → `1000`).
	const head = digits.slice(0, cut).replace(/^0+(?=\d)/, '');
	const tail = digits.slice(cut);
	const magnitude = decimals === 0 ? head : `${head}.${tail}`;
	// `-0.00` is not a number a cashier or a comparator should ever see.
	return negative && /[1-9]/.test(digits) ? `-${magnitude}` : magnitude;
}

/** The comparison width for one field: the ack's own width, or a fixed six. */
/** Cents — the floor the narrower-ack tolerance may never dip below. */
const CENT_DECIMALS = 2;

/**
 * THE width at which two spellings of money count as the same number.
 *
 * One function, used by BOTH halves on purpose. Detection and adoption have to
 * agree about equality or they open a gap between them: adoption would take a
 * server value the comparator never reported, the cart would recompute its own,
 * and `use-order-totals` would patch the difference back — a write loop nobody
 * was told about.
 *
 * Two cases:
 *
 *  - The ack is NARROWER than the POS value. That is a display-decimals
 *    rendering of the POS's own number (a store still on the pre-#1466 plugin
 *    sends `"6.71"` for `6.71328`), so the ack's width is the most it claims
 *    and the rounding artefact is tolerated. Floored at CENTS: rounding to the
 *    ack's width unconditionally lets unrelated numbers collide — `6.71328`
 *    against a whole-number `"7"` agrees at zero decimals, and adoption would
 *    then discard a 0.28 correction as "the same number". The floor also
 *    covers the integral-spelling case @wcpos-bot raised: POS arithmetic goes
 *    through `String(...)`, so a zero is spelled `"0"` with no decimal point
 *    and claims no storage precision at all.
 *  - The ack is as precise or MORE precise. Then it is either padding (`36.68`
 *    against `36.680000`, equal once the POS value is widened) or a real
 *    correction, and the wider width is what tells them apart. Capped at six,
 *    the contract width.
 */
function equivalenceDecimals(posDecimals: number, serverDecimals: number): number {
	if (serverDecimals < posDecimals) {
		return Math.min(EXACT_COMPARISON_DECIMALS, Math.max(serverDecimals, CENT_DECIMALS));
	}
	return Math.min(EXACT_COMPARISON_DECIMALS, Math.max(posDecimals, serverDecimals));
}

/**
 * The width one slot is compared at.
 *
 * `exact-6dp` uses `equivalenceDecimals` — the same equality the adoption half
 * uses. `server-precision` is the legacy rule: whatever width the ack printed,
 * trusted on its own.
 */
function comparisonDecimals(
	mode: MoneyPrecisionMode,
	posValue: string,
	serverValue: string
): number | null {
	if (mode !== 'exact-6dp') return decimalsOf(serverValue);
	const pos = decimalsOf(posValue);
	const server = decimalsOf(serverValue);
	if (pos === null || server === null) return null;
	return equivalenceDecimals(pos, server);
}

/**
 * Compare ONE monetary slot. Returns a divergence row, or null when the pair
 * agrees (or when there is nothing to compare because one side omitted it).
 */
function compareSlot(
	field: string,
	posValue: unknown,
	serverValue: unknown,
	mode: MoneyPrecisionMode
): MoneyDivergenceField | null {
	const pos = moneyString(posValue);
	const server = moneyString(serverValue);
	// Sparse ack / partial push: a field only one side carries is not evidence
	// of anything. Fabricating a zero for the missing side would invent a
	// divergence out of an omission.
	if (pos === null || server === null) return null;

	const decimals = comparisonDecimals(mode, pos, server);
	const roundedPos = decimals === null ? null : roundDecimalString(pos, decimals);
	const roundedServer = decimals === null ? null : roundDecimalString(server, decimals);
	if (roundedPos === null || roundedServer === null) {
		// One side is not a decimal literal at all. That is a broken money value,
		// not a rounding question — surface it rather than pass it through.
		return { field, expected: pos, got: server, decimals: null };
	}
	if (roundedPos === roundedServer) return null;
	return { field, expected: roundedPos, got: roundedServer, decimals };
}

/** Index an array of records by a numeric identity field, dropping duplicates. */
function indexByNumericKey(entries: unknown[], key: string): Map<number, Line> {
	const index = new Map<number, Line>();
	const ambiguous = new Set<number>();
	for (const entry of entries) {
		if (!isRecord(entry)) continue;
		const raw = entry[key];
		const id = typeof raw === 'number' ? raw : Number(raw);
		if (!Number.isInteger(id)) continue;
		if (index.has(id)) {
			ambiguous.add(id);
			continue;
		}
		index.set(id, entry);
	}
	for (const id of ambiguous) index.delete(id);
	return index;
}

/**
 * Walk every monetary slot of an order payload pair, calling `visit` with the
 * field path and the two values. The single traversal both the comparator and
 * the adoption guard run on, so they can never disagree about WHICH slots are
 * money.
 */
function walkMoneySlots(
	pos: Record<string, unknown>,
	server: Record<string, unknown>,
	visit: (
		field: string,
		posValue: unknown,
		serverValue: unknown,
		write: (v: string) => void
	) => void
): void {
	for (const field of ORDER_MONEY_FIELDS) {
		visit(field, pos[field], server[field], (value) => {
			server[field] = value;
		});
	}

	for (const arrayName of LINE_ARRAYS) {
		const posLines = pos[arrayName];
		const serverLines = server[arrayName];
		if (!Array.isArray(posLines) || !Array.isArray(serverLines)) continue;
		for (const pair of pairLinesByUuid(posLines, serverLines)) {
			const prefix = `${arrayName}[${pair.uuid}]`;
			for (const key of LINE_MONEY_KEYS) {
				visit(`${prefix}.${key}`, pair.local[key], pair.server[key], (value) => {
					pair.server[key] = value;
				});
			}
			const posTaxes = pair.local.taxes;
			const serverTaxes = pair.server.taxes;
			if (!Array.isArray(posTaxes) || !Array.isArray(serverTaxes)) continue;
			const posTaxIndex = indexByNumericKey(posTaxes, 'id');
			for (const [id, serverTax] of indexByNumericKey(serverTaxes, 'id')) {
				const posTax = posTaxIndex.get(id);
				if (!posTax) continue;
				for (const key of LINE_TAX_KEYS) {
					visit(`${prefix}.taxes[${id}].${key}`, posTax[key], serverTax[key], (value) => {
						serverTax[key] = value;
					});
				}
			}
		}
	}

	const posTaxLines = pos.tax_lines;
	const serverTaxLines = server.tax_lines;
	if (Array.isArray(posTaxLines) && Array.isArray(serverTaxLines)) {
		const posIndex = indexByNumericKey(posTaxLines, 'rate_id');
		for (const [rateId, serverTaxLine] of indexByNumericKey(serverTaxLines, 'rate_id')) {
			const posTaxLine = posIndex.get(rateId);
			if (!posTaxLine) continue;
			for (const key of TAX_LINE_KEYS) {
				visit(`tax_lines[${rateId}].${key}`, posTaxLine[key], serverTaxLine[key], (value) => {
					serverTaxLine[key] = value;
				});
			}
		}
	}
}

/**
 * Detect money the server did not keep.
 *
 * @param input.pushed - The payload the POS sent (the envelope's payload).
 * @param input.acked - The document the server returned for that push.
 * @param input.mode - Comparison strictness; defaults to `ORDER_MONEY_PRECISION_MODE`.
 * @returns Every divergent field, or null when the ack mirrors the push.
 */
export function compareOrderMoney(input: {
	pushed: Record<string, unknown>;
	acked: Record<string, unknown>;
	mode?: MoneyPrecisionMode;
}): OrderMoneyDivergence | null {
	const mode = input.mode ?? ORDER_MONEY_PRECISION_MODE;
	if (!isRecord(input.pushed) || !isRecord(input.acked)) return null;
	const fields: MoneyDivergenceField[] = [];
	// The traversal is read-only here; `write` is never called.
	walkMoneySlots(input.pushed, input.acked, (field, posValue, serverValue) => {
		const row = compareSlot(field, posValue, serverValue, mode);
		if (row) fields.push(row);
	});
	return fields.length === 0 ? null : { mode, fields };
}

/**
 * Keep the POS's SPELLING of any money the ack did not actually change — the
 * adoption half of the mirror contract.
 *
 * Ack adoption replaces the resident's payload wholesale with the server's, so
 * without this every re-spelling of an unchanged number lands on the record.
 * Both directions do damage, and the server has served each of them:
 *
 *  1. NARROWER than the POS destroys information the server never disputed. A
 *     pre-#1466 ack rewrites `6.71328` to `"6.71"`, and the sub-cent tax
 *     components 1.9 shipped are simply lost — #946 arriving through the write
 *     path instead of the read path.
 *  2. WIDER than the POS is the same problem wearing a nicer hat. Since
 *     woocommerce-pos#1466 the ack pads order-level `total` to `36.680000`
 *     against the cart's `36.68`. Nothing is lost, but the resident no longer
 *     matches what `use-order-totals` recomputes — and that hook answers a
 *     disagreement by patching, which enqueues a server write. An oscillation
 *     on every sale, caused purely by trailing zeros.
 *
 * So the rule is byte-equality, not precision: same number → keep the POS's
 * string; different number → the ACK WINS, unconditionally, because the server
 * is the source of truth and this was only ever about spelling.
 *
 * @param localPayload - The resident's payload before adoption.
 * @param ackedPayload - The payload projected from the ack document.
 * @returns The adoption payload, precision-preserved; the SAME reference when
 *   nothing needed preserving.
 */
export function preserveEquivalentLocalPrecision(
	localPayload: Record<string, unknown>,
	ackedPayload: Record<string, unknown>
): Record<string, unknown> {
	if (!isRecord(localPayload) || !isRecord(ackedPayload)) return ackedPayload;
	// Structured clone of just the parts the walk can touch; the walk writes
	// through `write` callbacks bound to this copy, never to the caller's object.
	const draft = JSON.parse(JSON.stringify(ackedPayload)) as Record<string, unknown>;
	let changed = false;

	walkMoneySlots(localPayload, draft, (_field, posValue, serverValue, write) => {
		const pos = moneyString(posValue);
		const server = moneyString(serverValue);
		if (pos === null || server === null) return;
		if (pos === server) return;
		const serverDecimals = decimalsOf(server);
		const posDecimals = decimalsOf(pos);
		if (serverDecimals === null || posDecimals === null) return;
		// Same NUMBER, different spelling → keep the POS's spelling. Anything the
		// ack actually CHANGED falls through untouched and is adopted, because
		// the server is the source of truth — and because the comparator, which
		// shares this equality, will have reported it.
		const width = equivalenceDecimals(posDecimals, serverDecimals);
		if (roundDecimalString(pos, width) !== roundDecimalString(server, width)) return;
		write(pos);
		changed = true;
	});

	return changed ? draft : ackedPayload;
}
