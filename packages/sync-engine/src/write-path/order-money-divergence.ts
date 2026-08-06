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
 * At the SERVER'S OWN returned precision, per field. v2 push acks currently
 * serialize money at DISPLAY decimals because the plugin's `dp` pins have not
 * landed (#946), so `6.713280` comes back as `"6.71"`. That is a serialization
 * width, not a different number, and flagging it would fire on every single
 * sale — an alert that fires on every sale is never read. So the POS value is
 * rounded to the ack string's own decimal count and then compared.
 *
 * `ORDER_MONEY_PRECISION_MODE` is the one constant that tightens this to exact
 * six-decimal comparison once #946's server-side pins land. Both modes are
 * pinned by tests; flipping the flag ahead of the server makes EVERY monetary
 * field diverge at once, which is a loud failure by construction, not a quiet
 * one.
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
 * TODO(#946): flip to `'exact-6dp'` when the plugin pins `dp=6` atomically
 * across `Order_Serializer::serialize_order`, `Catalog_Proxy_Controller::proxy`
 * and `Write_Controller::document_for` (the same ruling that unblocks the read
 * side). Until then a 2dp ack is the CONTRACT, not a defect, and comparing at
 * six decimals would alert on every sale. `order-money-divergence.test.ts` pins
 * both modes so the flip is a one-line change with its evidence already written.
 */
export const ORDER_MONEY_PRECISION_MODE: MoneyPrecisionMode = 'server-precision';

/** The precision `exact-6dp` compares at — 1.9's dp=6 money contract. */
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
 * A monetary value as a decimal STRING, or null when the slot holds nothing to
 * compare. An empty string is Woo's "unset", not a zero, so it reads as absent.
 * A number is accepted (some payload shapes carry `price` numerically) and
 * rendered through `String`, which is exact for every value Woo can serve.
 */
function moneyString(value: unknown): string | null {
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
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
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) return null;

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
function comparisonDecimals(mode: MoneyPrecisionMode, serverValue: string): number | null {
	return mode === 'exact-6dp' ? EXACT_COMPARISON_DECIMALS : decimalsOf(serverValue);
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

	const decimals = comparisonDecimals(mode, server);
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
 * Keep the POS's higher-precision money when the ack says THE SAME NUMBER at a
 * narrower width — the adoption half of the mirror contract.
 *
 * Ack adoption replaces the resident's payload wholesale with the server's, so
 * without this a 2dp ack silently rewrites `6.713280` to `"6.71"` on every
 * save. Two reasons that is the wrong trade while #946 is open:
 *
 *  1. It DESTROYS information the server never disputed. `"6.71"` is the same
 *     number rendered narrower, not a correction; the sub-cent tax components
 *     1.9 shipped are simply lost, which is the #946 bug arriving through the
 *     write path instead of the read path.
 *  2. It OSCILLATES. The cart recomputes `6.713280` from the same inputs on the
 *     next render, sees the resident holding `"6.71"`, and patches it back —
 *     a write the cashier never made, on a record that was already settled.
 *
 * When the numbers genuinely differ the ACK WINS, unconditionally: the server
 * is the source of truth and this is only ever about how wide the truth was
 * printed. It also never widens a value the POS itself held narrowly.
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
		const serverDecimals = decimalsOf(server);
		const posDecimals = decimalsOf(pos);
		if (serverDecimals === null || posDecimals === null) return;
		// Only ever a WIDENING of the same number, never a narrowing and never a
		// value change: the local string must be strictly more precise AND agree
		// with the ack once rounded to the ack's own width.
		if (posDecimals <= serverDecimals) return;
		if (roundDecimalString(pos, serverDecimals) !== roundDecimalString(server, serverDecimals)) {
			return;
		}
		write(pos);
		changed = true;
	});

	return changed ? draft : ackedPayload;
}
