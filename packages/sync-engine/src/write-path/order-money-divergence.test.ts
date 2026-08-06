import { describe, expect, it } from 'vitest';

import { ORDER_MONEY_ORACLE, ORDER_MONEY_ORACLE_LINE_UUID } from '@wcpos/sync-core/testing';

import {
	compareOrderMoney,
	ORDER_MONEY_PRECISION_MODE,
	preserveEquivalentLocalPrecision,
	roundDecimalString,
} from './order-money-divergence';

const { pos, server6dp, server2dp } = ORDER_MONEY_ORACLE;

/** Deep-clone a fixture so a mutation in one test cannot leak into the next. */
function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function lineOf(payload: Record<string, unknown>): Record<string, unknown> {
	return (payload.line_items as Record<string, unknown>[])[0]!;
}

describe('roundDecimalString', () => {
	it.each([
		['29.970000', 2, '29.97'],
		['5.994000', 2, '5.99'],
		['0.719280', 2, '0.72'],
		['6.713280', 2, '6.71'],
		['36.683280', 2, '36.68'],
		// Half-UP away from zero, matching PHP's round()/wc_format_decimal — and
		// done on the DIGITS, so the classic float midpoint (1.005 is really
		// 1.00499999...) cannot flip the answer.
		['1.005', 2, '1.01'],
		['-1.005', 2, '-1.01'],
		['19.275', 2, '19.28'],
		['2.675', 2, '2.68'],
		// Carry propagation across the decimal point.
		['9.999', 2, '10.00'],
		['-9.999', 2, '-10.00'],
		// Padding when the value is SHORTER than the requested precision.
		['5', 2, '5.00'],
		['0.5', 6, '0.500000'],
		['.5', 2, '0.50'],
		// Zero decimals.
		['0.5', 0, '1'],
		['0.4', 0, '0'],
	])('rounds %s at %i decimals to %s', (value, decimals, expected) => {
		expect(roundDecimalString(value, decimals)).toBe(expected);
	});

	it.each([
		// Exponent forms are expanded by `moneyString` before they reach the
		// rounder, so the rounder itself only ever sees plain decimals.
		['0.0000001', 6, '0.000000'],
		['1000000000000000000000', 2, '1000000000000000000000.00'],
	])('rounds the expanded %s at %i decimals to %s', (value, decimals, expected) => {
		expect(roundDecimalString(value, decimals)).toBe(expected);
	});

	it('accepts a width no store would ever configure rather than refusing it', () => {
		expect(roundDecimalString('1.5', 30)).toBe(`1.5${'0'.repeat(29)}`);
	});

	it.each(['', '  ', 'abc', '1.2.3', '1,00', '£1.00', 'NaN', 'Infinity'])(
		'refuses the non-decimal %j rather than guessing a number',
		(value) => {
			expect(roundDecimalString(value, 2)).toBeNull();
		}
	);
});

describe('compareOrderMoney — server-precision mode (the legacy rule)', () => {
	it('does not flag the oracle: 2dp serialization of the same money is NOT divergence', () => {
		expect(
			compareOrderMoney({
				pushed: pos,
				acked: server2dp,
				mode: 'server-precision',
			})
		).toBeNull();
	});

	it('flags a real recalculation — a server-side surcharge the POS never computed', () => {
		const acked = clone(server2dp);
		acked.total = '50.07';
		const divergence = compareOrderMoney({
			pushed: pos,
			acked,
			mode: 'server-precision',
		});
		expect(divergence).not.toBeNull();
		expect(divergence?.mode).toBe('server-precision');
		expect(divergence?.fields).toEqual([
			{ field: 'total', expected: '36.68', got: '50.07', decimals: 2 },
		]);
	});

	it('flags a divergent LINE total and names the line by its uuid', () => {
		const acked = clone(server2dp);
		lineOf(acked).total = '19.98';
		const divergence = compareOrderMoney({
			pushed: pos,
			acked,
			mode: 'server-precision',
		});
		expect(divergence?.fields).toEqual([
			{
				field: `line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].total`,
				expected: '29.97',
				got: '19.98',
				decimals: 2,
			},
		]);
	});

	it('reports EVERY divergent field, not just the first — the cashier needs the whole picture', () => {
		const acked = clone(server2dp);
		acked.total = '50.07';
		acked.total_tax = '11.10';
		acked.discount_total = '1.00';
		const divergence = compareOrderMoney({
			pushed: pos,
			acked,
			mode: 'server-precision',
		});
		expect(divergence?.fields.map((f) => f.field)).toEqual([
			'total',
			'total_tax',
			'discount_total',
		]);
	});

	it('rounds the POS value to the ACK’s own precision, per field', () => {
		// A server that serves `total` at 2dp but `cart_tax` at 6dp is compared
		// at BOTH precisions — the ack string is the authority on its own width.
		const acked = clone(server2dp);
		acked.cart_tax = '6.713280';
		expect(compareOrderMoney({ pushed: pos, acked, mode: 'server-precision' })).toBeNull();
	});

	it('trusts a narrow ack blindly, however far it is from the POS value', () => {
		// The legacy rule's blind spot, pinned as the reason it is not the shipped
		// one: rounding to whatever width the ack printed lets unrelated numbers
		// agree. A whole-number ack of `"7"` against the POS's `6.71328` compares
		// at ZERO decimals and reads as identical — a 0.28 correction, silent.
		const acked = clone(server2dp);
		acked.cart_tax = '7';
		expect(compareOrderMoney({ pushed: pos, acked, mode: 'server-precision' })).toBeNull();
		// The shipped rule floors the tolerance at cents and reports it.
		expect(compareOrderMoney({ pushed: pos, acked, mode: 'exact-6dp' })?.fields).toEqual([
			{ field: 'cart_tax', expected: '6.71', got: '7.00', decimals: 2 },
		]);
	});

	it('tolerates a sparse ack: fields the server omitted are not compared', () => {
		const acked = clone(server2dp);
		delete acked.total_tax;
		delete acked.line_items;
		expect(compareOrderMoney({ pushed: pos, acked, mode: 'server-precision' })).toBeNull();
	});

	it('ignores lines the POS never authored — an appended server fee line is not a line divergence', () => {
		const acked = clone(server2dp);
		(acked.fee_lines as unknown) = [{ id: 91, name: 'Gateway fee', total: '5.00' }];
		// The order-level `total` still agrees here, so nothing fires: the appended
		// line surfaces through `total` when it actually moves the money.
		expect(compareOrderMoney({ pushed: pos, acked, mode: 'server-precision' })).toBeNull();
	});

	it('ignores an ambiguous line pairing rather than guessing which line moved', () => {
		const pushed = clone(pos);
		const duplicated = clone(lineOf(pushed));
		(pushed.line_items as unknown[]).push(duplicated);
		const acked = clone(server2dp);
		lineOf(acked).total = '19.98';
		expect(compareOrderMoney({ pushed, acked, mode: 'server-precision' })).toBeNull();
	});

	it('does not mistake exponent notation for a divergence', () => {
		// `String(0.0000001)` is `'1e-7'`. A payload carrying money NUMERICALLY
		// would otherwise read as unparseable and alert against itself.
		expect(
			compareOrderMoney({
				pushed: { total: 0.0000001 },
				acked: { total: '0.0000001' },
				mode: 'exact-6dp',
			})
		).toBeNull();
	});

	it('compares numeric money against its string form without complaint', () => {
		const pushed = { ...clone(pos), total: 36.68 };
		expect(compareOrderMoney({ pushed, acked: server2dp, mode: 'server-precision' })).toBeNull();
	});

	it('flags an unparseable ack value instead of silently passing it', () => {
		const acked = clone(server2dp);
		acked.total = 'n/a';
		const divergence = compareOrderMoney({
			pushed: pos,
			acked,
			mode: 'server-precision',
		});
		expect(divergence?.fields).toEqual([
			{ field: 'total', expected: '36.68', got: 'n/a', decimals: null },
		]);
	});
});

describe('compareOrderMoney — exact-6dp mode (woocommerce-pos#1466 is live)', () => {
	it('is the shipped default now that the server guarantee is live', () => {
		expect(ORDER_MONEY_PRECISION_MODE).toBe('exact-6dp');
		// The default path and the explicit path must agree, or the flag is decorative.
		expect(compareOrderMoney({ pushed: pos, acked: server6dp })).toBeNull();
	});

	it('is SILENT against the live six-decimal ack', () => {
		expect(compareOrderMoney({ pushed: pos, acked: server6dp, mode: 'exact-6dp' })).toBeNull();
	});

	it('flags a six-decimal correction to an integrally spelled local value', () => {
		const divergence = compareOrderMoney({
			pushed: { cart_tax: '0' },
			acked: { cart_tax: '0.010000' },
			mode: 'exact-6dp',
		});
		expect(divergence?.fields).toEqual([
			{ field: 'cart_tax', expected: '0.000000', got: '0.010000', decimals: 6 },
		]);
	});

	it('tolerates the 2dp-STORAGE padding on order-level total', () => {
		// WC_Abstract_Order::set_total stores at display decimals on every route,
		// so `dp=6` only widens the string: the POS holds `36.68` and the ack says
		// `36.680000`. Comparing at the narrower width makes that one number.
		// Live-observed shape: `50.070000` for a 50.07 order.
		expect((server6dp as { total: string }).total).toBe('36.680000');
		expect((pos as { total: string }).total).toBe('36.68');
		expect(
			compareOrderMoney({
				pushed: { total: '45.00' },
				acked: { total: '45.000000' },
				mode: 'exact-6dp',
			})
		).toBeNull();
	});

	it('still catches a real recalculation hiding behind that padding', () => {
		// The live payment-time case, 45.00 -> 50.07, arriving 2dp-padded.
		const divergence = compareOrderMoney({
			pushed: { total: '45.00' },
			acked: { total: '50.070000' },
			mode: 'exact-6dp',
		});
		expect(divergence?.fields).toEqual([
			{ field: 'total', expected: '45.000000', got: '50.070000', decimals: 6 },
		]);
	});

	it('compares genuinely six-decimal money at six decimals — the point of #946', () => {
		// `cart_tax` is the field that carries sub-cent components (WC sums
		// per-rate taxes unrounded), and it is now compared without being rounded
		// away. A sub-cent server disagreement here is a real divergence.
		const acked = clone(server6dp);
		acked.cart_tax = '6.714000';
		const divergence = compareOrderMoney({ pushed: pos, acked, mode: 'exact-6dp' });
		expect(divergence?.fields).toEqual([
			{ field: 'cart_tax', expected: '6.713280', got: '6.714000', decimals: 6 },
		]);
	});

	it('flags a sub-cent LINE divergence the old 2dp comparison would have swallowed', () => {
		const acked = clone(server6dp);
		lineOf(acked).total_tax = '6.723280';
		const divergence = compareOrderMoney({ pushed: pos, acked, mode: 'exact-6dp' });
		expect(divergence?.fields).toEqual([
			{
				field: `line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].total_tax`,
				expected: '6.713280',
				got: '6.723280',
				decimals: 6,
			},
		]);
	});

	it('stays SILENT against a store still on the old plugin — version skew must not alert', () => {
		// A till upgraded ahead of its store keeps receiving display decimals.
		// Comparing at the narrower width keeps that correctly quiet; the previous
		// design flagged every taxed sale here, which is an alert nobody reads.
		expect(compareOrderMoney({ pushed: pos, acked: server2dp, mode: 'exact-6dp' })).toBeNull();
	});

	it('still catches a real recalculation from a store on the old plugin', () => {
		const acked = clone(server2dp);
		acked.total = '50.07';
		const divergence = compareOrderMoney({ pushed: pos, acked, mode: 'exact-6dp' });
		expect(divergence?.fields).toEqual([
			{ field: 'total', expected: '36.68', got: '50.07', decimals: 2 },
		]);
	});
});

describe('preserveEquivalentLocalPrecision (the adoption half of the mirror contract)', () => {
	it('keeps the sub-cent local value when a pre-#1466 ack says the same number at 2dp', () => {
		const merged = preserveEquivalentLocalPrecision(pos, server2dp);
		expect(merged.cart_tax).toBe('6.71328');
		expect(lineOf(merged).total_tax).toBe('6.71328');
		expect(
			((lineOf(merged).taxes as Record<string, unknown>[])[0] as Record<string, unknown>).total
		).toBe('5.994');
	});

	it('keeps the local spelling when the LIVE ack merely pads it wider', () => {
		// The regression this guards: adopting `36.680000` over the cart's
		// `36.68` leaves the resident disagreeing with what use-order-totals
		// recomputes, and that hook patches a disagreement — a server write on
		// every sale, caused by trailing zeros.
		const merged = preserveEquivalentLocalPrecision(pos, server6dp);
		expect(merged.total).toBe('36.68');
		expect(merged.total_tax).toBe('6.71');
		expect(merged.cart_tax).toBe('6.71328');
		expect(lineOf(merged).total).toBe('29.97');
		expect((merged.tax_lines as Record<string, unknown>[])[0]!.tax_total).toBe('5.99');
	});

	it('leaves the resident byte-identical to the cart’s own arithmetic', () => {
		// The property the no-oscillation contract actually needs: every money
		// slot the ack did not change comes back spelled exactly as the POS
		// spelled it, so a JSON compare in use-order-totals finds nothing to do.
		const merged = preserveEquivalentLocalPrecision(pos, server6dp);
		for (const field of ['total', 'total_tax', 'cart_tax', 'discount_total', 'shipping_total']) {
			expect(merged[field]).toBe((pos as Record<string, unknown>)[field]);
		}
	});

	it('adopts the server value whenever the numbers actually differ — server is truth', () => {
		const acked = clone(server6dp);
		acked.total = '50.070000';
		const merged = preserveEquivalentLocalPrecision(pos, acked);
		expect(merged.total).toBe('50.070000');
		// …and the fields that DID agree still keep the POS's spelling.
		expect(merged.cart_tax).toBe('6.71328');
	});

	it('adopts a six-decimal server correction to an integrally spelled local value', () => {
		const merged = preserveEquivalentLocalPrecision({ cart_tax: '0' }, { cart_tax: '0.010000' });
		expect(merged.cart_tax).toBe('0.010000');
	});

	it('leaves non-monetary fields to the ack — identity and status are the server’s', () => {
		const acked = clone(server6dp);
		acked.status = 'completed';
		acked.number = '1042';
		const merged = preserveEquivalentLocalPrecision(pos, acked);
		expect(merged.status).toBe('completed');
		expect(merged.number).toBe('1042');
	});

	it('returns the ack payload unchanged when there is nothing to preserve', () => {
		const acked = clone(server6dp);
		expect(preserveEquivalentLocalPrecision({}, acked)).toBe(acked);
	});

	// The tolerance must never swallow a correction. Rounding to the ack's own
	// width unconditionally does exactly that: unrelated numbers agree once the
	// width is narrow enough.
	it.each([
		['a whole-number ack', 'cart_tax', '7', '7'],
		['a one-decimal ack', 'cart_tax', '6.8', '6.8'],
		['a wider ack that really differs', 'cart_tax', '6.714000', '6.714000'],
	])('adopts %s rather than keeping the stale POS value', (_case, field, acked, expected) => {
		const ack = clone(server6dp);
		(ack as Record<string, unknown>)[field] = acked;
		const merged = preserveEquivalentLocalPrecision(pos, ack);
		expect(merged[field]).toBe(expected);
	});

	it('keeps detection and adoption on the SAME equality — no silent adoption', () => {
		// If adoption changes a value the comparator did not report, the cart
		// recomputes its own, use-order-totals patches the difference back, and
		// nobody was ever told. Sweep both halves over the same acks.
		for (const ackedCartTax of ['6.71328', '6.713280', '6.71', '7', '6.714000', '6.8']) {
			const ack = clone(server6dp);
			ack.cart_tax = ackedCartTax;
			const reported = compareOrderMoney({ pushed: pos, acked: ack, mode: 'exact-6dp' })?.fields;
			const adopted = preserveEquivalentLocalPrecision(pos, ack).cart_tax !== pos.cart_tax;
			const flagged = (reported ?? []).some((f) => f.field === 'cart_tax');
			expect({ ack: ackedCartTax, adopted }).toEqual({ ack: ackedCartTax, adopted: flagged });
		}
	});
});
