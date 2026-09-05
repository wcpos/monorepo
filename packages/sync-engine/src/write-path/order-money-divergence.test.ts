import { describe, expect, it } from 'vitest';

import { ORDER_MONEY_ORACLE, ORDER_MONEY_ORACLE_LINE_UUID } from '@wcpos/sync-core/testing';

import {
	classifyMoneyDivergence,
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
		// The shipped rule preserves the wider POS width and reports it.
		expect(compareOrderMoney({ pushed: pos, acked, mode: 'exact-6dp' })?.fields).toEqual([
			{ field: 'cart_tax', expected: '6.71328', got: '7.00000', decimals: 5 },
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
	// CHECKOUT401, issue #1875 class A: Sentry line-tax samples rendered at 2dp,
	// then padded to six by the plugin. Detection AND adoption must ignore padding.
	it.each([
		['1.735537', '1.740000'],
		['2.290909', '2.290000'],
		['5.206612', '5.210000'],
	])('preserves line taxes %s when the ack merely renders %s', (expected, got) => {
		const pushed = clone(pos);
		const acked = clone(pos);
		for (const key of ['total_tax', 'subtotal_tax']) {
			lineOf(pushed)[key] = expected;
			lineOf(acked)[key] = got;
		}
		expect(compareOrderMoney({ pushed, acked })).toBeNull();
		const adopted = lineOf(preserveEquivalentLocalPrecision(pushed, acked));
		expect(adopted.total_tax).toBe(expected);
		expect(adopted.subtotal_tax).toBe(expected);
	});

	it.each([
		['36.68', '36.680001'],
		['29.97', '30.000000'],
		// CHECKOUT401 Sentry: real order-level cent and material differences.
		['22.49', '22.500000'],
		['50.000000', '98.000000'],
	])('reports and adopts the real correction %s -> %s', (expected, got) => {
		const pushed = { total: expected };
		const acked = { total: got };
		expect(compareOrderMoney({ pushed, acked })?.fields).toHaveLength(1);
		expect(preserveEquivalentLocalPrecision(pushed, acked).total).toBe(got);
	});

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
			{ field: 'cart_tax', expected: '0.00', got: '0.01', decimals: 2 },
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
			{ field: 'total', expected: '45.00', got: '50.07', decimals: 2 },
		]);
	});

	it('compares sub-cent money at the effective server width — the point of #946', () => {
		// `cart_tax` is the field that carries sub-cent components (WC sums
		// per-rate taxes unrounded), and it is now compared without being rounded
		// away. A sub-cent server disagreement here is a real divergence.
		const acked = clone(server6dp);
		acked.cart_tax = '6.714000';
		const divergence = compareOrderMoney({ pushed: pos, acked, mode: 'exact-6dp' });
		expect(divergence?.fields).toEqual([
			{ field: 'cart_tax', expected: '6.713', got: '6.714', decimals: 3 },
		]);
	});

	it('flags a sub-cent LINE divergence the old 2dp comparison would have swallowed', () => {
		const acked = clone(server6dp);
		lineOf(acked).total_tax = '6.723280';
		const divergence = compareOrderMoney({ pushed: pos, acked, mode: 'exact-6dp' });
		expect(divergence?.fields).toEqual([
			{
				field: `line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].total_tax`,
				expected: '6.71328',
				got: '6.72328',
				decimals: 5,
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

	it('is SILENT on a one-microunit rounding tie at full width (PHP float vs decimal round)', () => {
		// Live shape (dev-next 2026-08-08): a plain one-product sale where the
		// half-way tie at the 6th decimal landed on different sides per engine.
		// The cashier must NOT be alarmed over 0.000001.
		expect(
			compareOrderMoney({
				pushed: { cart_tax: '4.575164' },
				acked: { cart_tax: '4.575163' },
				mode: 'exact-6dp',
			})
		).toBeNull();
	});

	it('flags TWO microunits at full width — the epsilon is a tie, not a tolerance band', () => {
		const divergence = compareOrderMoney({
			pushed: { cart_tax: '4.575164' },
			acked: { cart_tax: '4.575162' },
			mode: 'exact-6dp',
		});
		expect(divergence?.fields).toEqual([
			{ field: 'cart_tax', expected: '4.575164', got: '4.575162', decimals: 6 },
		]);
	});

	it('never applies the tie epsilon at display width — one unit there is a whole cent', () => {
		const divergence = compareOrderMoney({
			pushed: { total: '36.68' },
			acked: { total: '36.69' },
			mode: 'exact-6dp',
		});
		expect(divergence?.fields).toEqual([
			{ field: 'total', expected: '36.68', got: '36.69', decimals: 2 },
		]);
	});
});

/**
 * #1507: the POS no longer PUTS the order aggregate in a push BODY — those
 * fields are readonly in the wc/v3 schema and dropped before anything is set.
 *
 * It is still COMPARED. The cashier has to be told when the store's total is
 * not the total they charged, so the drain carries the till's aggregate beside
 * the payload (`tillAggregateFor`) and hands the pair to `compareOrderMoney`.
 * These cases pin the comparator's behaviour for the residue — a slot neither
 * side supplies. The rule is unchanged and long-standing (a field only one side
 * carries is not evidence of anything); it is pinned here because if a future
 * edit made an absent value read as zero, every sale would report a divergence.
 */
describe('an order compared without an aggregate on either side', () => {
	/** The payload as it now goes on the wire: line money, no order money. */
	function withoutAggregate(payload: Record<string, unknown>): Record<string, unknown> {
		const stripped = clone(payload);
		for (const field of [
			'total',
			'total_tax',
			'cart_tax',
			'discount_total',
			'discount_tax',
			'shipping_total',
			'shipping_tax',
			'tax_lines',
		]) {
			delete stripped[field];
		}
		return stripped;
	}

	it('is silent about an aggregate the till never supplied', () => {
		const acked = clone(server6dp);
		acked.total = '999.99';
		acked.cart_tax = '111.11';
		acked.discount_total = '5.00';

		expect(compareOrderMoney({ pushed: withoutAggregate(pos), acked })).toBeNull();
	});

	it('still reports the line money the POS DOES assert', () => {
		const acked = clone(server6dp);
		lineOf(acked).total = '19.980000';

		expect(compareOrderMoney({ pushed: withoutAggregate(pos), acked })?.fields).toEqual([
			{
				field: `line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].total`,
				expected: '29.97',
				got: '19.98',
				decimals: 2,
			},
		]);
	});

	it('still reports the aggregate once the till supplies it (the drain always does)', () => {
		const acked = clone(server6dp);
		acked.total = '50.070000';

		expect(
			compareOrderMoney({
				// What the drain hands over: the wire payload, plus the till's own
				// aggregate captured from the resident at push time.
				pushed: { ...withoutAggregate(pos), total: pos.total as string },
				acked,
			})?.fields
		).toEqual([{ field: 'total', expected: '36.68', got: '50.07', decimals: 2 }]);
	});

	it('leaves adoption alone — that half reads the RESIDENT, which keeps its money', () => {
		// The push no longer carries the aggregate, but the resident still holds
		// the cart's own arithmetic, so an ack that merely re-spells it must not
		// overwrite the local spelling and restart the patch loop.
		const adopted = preserveEquivalentLocalPrecision(clone(pos), clone(server6dp));

		expect(adopted.total).toBe(pos.total);
		expect(adopted.cart_tax).toBe(pos.cart_tax);
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

	it('adopts a six-decimal correction beyond the POS decimal width', () => {
		// NOT a rounding tie: the POS authored 2dp, so the microunit is a genuine
		// server correction, not two engines disagreeing about the same 6dp round.
		const merged = preserveEquivalentLocalPrecision({ total: '36.68' }, { total: '36.680001' });
		expect(merged.total).toBe('36.680001');
	});

	it('keeps the POS spelling on a one-microunit rounding tie between two full-width values', () => {
		// Shares the comparator's tie equality: adopting the server's microunit
		// would make use-order-totals recompute the POS value, see a difference,
		// and patch it back — the write loop this function exists to prevent.
		const merged = preserveEquivalentLocalPrecision(
			{ cart_tax: '4.575164' },
			{ cart_tax: '4.575163' }
		);
		expect(merged.cart_tax).toBe('4.575164');
	});

	it('adopts a correction that COLLIDES at the ack width — the cent floor', () => {
		// The case a bare `serverDecimals < posDecimals ? serverDecimals : …`
		// rule silently loses: rounding 29.97 to the ack's one decimal makes it
		// 30.0, identical to the ack, and a 3-cent server correction is dropped
		// as "the same number". Cents is the floor because below a cent there is
		// no money left to protect.
		const merged = preserveEquivalentLocalPrecision({ total: '29.97' }, { total: '30.0' });
		expect(merged.total).toBe('30.0');
		expect(
			compareOrderMoney({
				pushed: { total: '29.97' },
				acked: { total: '30.0' },
				mode: 'exact-6dp',
			})?.fields
		).toEqual([{ field: 'total', expected: '29.97', got: '30.00', decimals: 2 }]);
	});

	it('adopts a zero-decimal correction that collides at cents', () => {
		const merged = preserveEquivalentLocalPrecision({ total: '6.9999' }, { total: '7' });
		expect(merged.total).toBe('7');
		expect(
			compareOrderMoney({
				pushed: { total: '6.9999' },
				acked: { total: '7' },
				mode: 'exact-6dp',
			})?.fields
		).toEqual([{ field: 'total', expected: '6.9999', got: '7.0000', decimals: 4 }]);
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

// CHECKOUT401 Sentry order-level samples from #1875; the microunit control
// ensures real sub-cent corrections remain distinguishable from a whole cent.
describe('classifyMoneyDivergence', () => {
	it.each([
		['36.68', '36.680001', 'sub-cent'],
		['22.49', '22.500000', 'cent'],
		['50.000000', '98.000000', 'material'],
	])('classifies %s -> %s as %s', (expected, got, roundingClass) => {
		const divergence = compareOrderMoney({ pushed: { total: expected }, acked: { total: got } });
		expect(divergence).not.toBeNull();
		expect(classifyMoneyDivergence(divergence!.fields)).toBe(roundingClass);
	});

	it('classifies the largest difference, regardless of field order or sign', () => {
		const subCent = { field: 'cart_tax', expected: '0.002', got: '0.001', decimals: 3 };
		const cent = { field: 'total', expected: '22.50', got: '22.49', decimals: 2 };
		const material = { field: 'total', expected: '0.000000', got: '0.010001', decimals: 6 };
		expect(classifyMoneyDivergence([subCent, subCent])).toBe('sub-cent');
		expect(classifyMoneyDivergence([subCent, cent])).toBe('cent');
		expect(classifyMoneyDivergence([cent, subCent])).toBe('cent');
		expect(classifyMoneyDivergence([cent, material])).toBe('material');
		expect(classifyMoneyDivergence([{ ...cent, expected: 'invalid', decimals: null }])).toBe(
			'material'
		);
	});
});
