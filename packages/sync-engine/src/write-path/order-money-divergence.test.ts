import { describe, expect, it } from 'vitest';

import { ORDER_MONEY_ORACLE, ORDER_MONEY_ORACLE_LINE_UUID } from '@wcpos/sync-core/testing';

import {
	compareOrderMoney,
	ORDER_MONEY_PRECISION_MODE,
	preserveEquivalentLocalPrecision,
	roundDecimalString,
} from './order-money-divergence';

const { pos, server2dp } = ORDER_MONEY_ORACLE;

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

	it.each(['', '  ', 'abc', '1.2.3', '1,00', '£1.00', 'NaN', 'Infinity'])(
		'refuses the non-decimal %j rather than guessing a number',
		(value) => {
			expect(roundDecimalString(value, 2)).toBeNull();
		}
	);
});

describe('compareOrderMoney — server-precision mode (the #946 reality)', () => {
	it('does not flag the oracle: 2dp serialization of the same money is NOT divergence', () => {
		expect(
			compareOrderMoney({
				pushed: pos,
				acked: server2dp,
				mode: 'server-precision',
			})
		).toBeNull();
	});

	it('ships with server-precision as the default mode while #946 is open', () => {
		expect(ORDER_MONEY_PRECISION_MODE).toBe('server-precision');
		// The default path and the explicit path must agree, or the flag is decorative.
		expect(compareOrderMoney({ pushed: pos, acked: server2dp })).toBeNull();
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
		// A server that serves `total` at 2dp but `total_tax` at 6dp is compared
		// at BOTH precisions — the ack string is the authority on its own width.
		const acked = clone(server2dp);
		acked.total_tax = '6.713280';
		expect(compareOrderMoney({ pushed: pos, acked, mode: 'server-precision' })).toBeNull();
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

	it('flags an unparseable ack value instead of silently passing it', () => {
		const acked = clone(server2dp);
		acked.total = 'n/a';
		const divergence = compareOrderMoney({
			pushed: pos,
			acked,
			mode: 'server-precision',
		});
		expect(divergence?.fields).toEqual([
			{ field: 'total', expected: '36.683280', got: 'n/a', decimals: null },
		]);
	});
});

describe('compareOrderMoney — exact-6dp mode (after #946 lands server-side)', () => {
	it('is SILENT when the server serves the full six decimals', () => {
		expect(compareOrderMoney({ pushed: pos, acked: pos, mode: 'exact-6dp' })).toBeNull();
	});

	it('flags the 2dp ack LOUDLY — flipping the mode without server support must not fail quiet', () => {
		const divergence = compareOrderMoney({
			pushed: pos,
			acked: server2dp,
			mode: 'exact-6dp',
		});
		expect(divergence).not.toBeNull();
		expect(divergence?.mode).toBe('exact-6dp');
		// Every component the server ROUNDED diverges — order level, line level and
		// the nested tax rows — which is exactly the signal that the mode was
		// flipped ahead of the server. Nothing here degrades to silence.
		expect(divergence?.fields.map((f) => f.field)).toEqual(
			expect.arrayContaining([
				'total',
				'total_tax',
				'cart_tax',
				`line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].total_tax`,
				`line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].taxes[1].total`,
				'tax_lines[2].tax_total',
			])
		);
		// A value the 2dp serialization did NOT round (29.970000 → "29.97") is
		// still the same number at six decimals, so it must stay silent even here.
		expect(divergence?.fields.map((f) => f.field)).not.toContain(
			`line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].subtotal`
		);
		expect(divergence?.fields.every((f) => f.decimals === 6)).toBe(true);
	});
});

describe('preserveEquivalentLocalPrecision (the adoption half of the mirror contract)', () => {
	it('keeps the six-decimal local value when the ack says the same number at 2dp', () => {
		const merged = preserveEquivalentLocalPrecision(pos, server2dp);
		expect(merged.total).toBe('36.683280');
		expect(merged.total_tax).toBe('6.713280');
		expect(lineOf(merged).total_tax).toBe('6.713280');
		expect(
			((lineOf(merged).taxes as Record<string, unknown>[])[0] as Record<string, unknown>).total
		).toBe('5.994000');
		expect((merged.tax_lines as Record<string, unknown>[])[0]!.tax_total).toBe('5.994000');
	});

	it('adopts the server value whenever the numbers actually differ — server is truth', () => {
		const acked = clone(server2dp);
		acked.total = '50.07';
		const merged = preserveEquivalentLocalPrecision(pos, acked);
		expect(merged.total).toBe('50.07');
		// …and the fields that DID agree still keep their precision.
		expect(merged.total_tax).toBe('6.713280');
	});

	it('never upgrades a local value to a WIDER string than it had', () => {
		const pushed = clone(pos);
		pushed.total = '36.68';
		const merged = preserveEquivalentLocalPrecision(pushed, server2dp);
		expect(merged.total).toBe('36.68');
	});

	it('leaves non-monetary fields to the ack — identity and status are the server’s', () => {
		const acked = clone(server2dp);
		acked.status = 'completed';
		acked.number = '1042';
		const merged = preserveEquivalentLocalPrecision(pos, acked);
		expect(merged.status).toBe('completed');
		expect(merged.number).toBe('1042');
	});

	it('returns the ack payload unchanged when there is nothing to preserve', () => {
		const acked = clone(server2dp);
		expect(preserveEquivalentLocalPrecision({}, acked)).toBe(acked);
	});
});
