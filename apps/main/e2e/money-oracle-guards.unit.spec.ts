import { expect, test } from './test';
import { assertDiscriminating, assertMixedTaxTreatment } from './money-oracle-guards';

/**
 * Unit pins for the money oracle's COVERAGE GUARDS — no page, no store.
 *
 * Both guards shipped on 2026-08-24 incapable of failing, and both were caught only by
 * reading live log output. This file is the mechanism that makes that unnecessary: a
 * guard's whole job is to return FALSE on inadequate evidence, so the cases that
 * matter here are the ones that MUST THROW.
 *
 * The rule these pins encode: an assertion is code. The money rules it protects were
 * each mutation-checked; the assertion itself must be too, and this is where that is
 * cheap. Same reason `order-lifecycle.unit.spec.ts` exists after two coercion holes.
 *
 * When adding a guard, write its must-throw case FIRST and watch it fail before
 * writing the guard body.
 */

const line = (...totals: (string | number)[]) => ({
	taxes: totals.map((total, index) => ({ id: index + 1, total })),
});

test.describe('assertDiscriminating', () => {
	test('THROWS when every per-rate tax lands on the store precision (the original hole)', () => {
		// 0.70 at 2dp is identical whether stored raw or rounded, so a run made only of
		// these proves nothing. The first version compared toFixed(2) !== toFixed(6) —
		// two strings of different WIDTH — and passed on exactly this input.
		expect(() =>
			assertDiscriminating({ fee_lines: [line('0.700000', '0.200000')] }, 'fee_lines', 'x', 2)
		).toThrow(/NOT COVERED/);
	});

	test('passes when a per-rate tax carries content below the store precision', () => {
		assertDiscriminating({ fee_lines: [line('0.090909')] }, 'fee_lines', 'x', 2);
	});

	test('respects the store precision — 0.555 discriminates at 2dp but NOT at 3dp', () => {
		assertDiscriminating({ fee_lines: [line('0.555')] }, 'fee_lines', 'x', 2);
		expect(() => assertDiscriminating({ fee_lines: [line('0.555')] }, 'fee_lines', 'x', 3)).toThrow(
			/NOT COVERED/
		);
	});

	test('THROWS at dp=0 on a whole unit, where the spread is widest (JPY)', () => {
		expect(() => assertDiscriminating({ fee_lines: [line('91')] }, 'fee_lines', 'x', 0)).toThrow(
			/NOT COVERED/
		);
		assertDiscriminating({ fee_lines: [line('90.818182')] }, 'fee_lines', 'x', 0);
	});

	test('THROWS when the line type under test carries no taxes at all', () => {
		// The zero-fee case: a numpad interaction that did not take leaves 0 on both
		// sides, which compares equal. Without this the scenario green-lights on a fee
		// it never rang up.
		expect(() => assertDiscriminating({ fee_lines: [{ taxes: [] }] }, 'fee_lines', 'x', 2)).toThrow(
			/no per-rate taxes/
		);
		expect(() => assertDiscriminating({}, 'fee_lines', 'x', 2)).toThrow(/no per-rate taxes/);
	});

	test('is SCOPED — a discriminating product tax cannot vouch for the fee under test', () => {
		// The order-wide version of this check passed on the wrong evidence: the probe
		// product's sub-cent tax satisfied it while the fee was 0.
		const doc = { line_items: [line('0.090909')], fee_lines: [line('0.700000')] };
		expect(() => assertDiscriminating(doc, 'fee_lines', 'x', 2)).toThrow(/NOT COVERED/);
	});
});

test.describe('assertMixedTaxTreatment', () => {
	test('THROWS on a taxed line beside an untaxed one (the original hole)', () => {
		// Two distinct signatures, but only ONE rate ever applied. dev-pro passed this
		// while its reduced-rate fixture rang up untaxed.
		const doc = { line_items: [line('5.50'), { taxes: [] }] };
		expect(() => assertMixedTaxTreatment(doc, 'x')).toThrow(/fewer than two distinct rate sets/);
	});

	test('passes on two distinct rate sets plus an untaxed line', () => {
		const doc = {
			line_items: [
				{ taxes: [{ id: 6, total: '5.50' }] },
				{ taxes: [{ id: 8, total: '0.4995' }] },
				{ taxes: [] },
			],
		};
		assertMixedTaxTreatment(doc, 'x');
	});

	test('THROWS when no untaxed line ran — the other half of the cart', () => {
		const doc = {
			line_items: [{ taxes: [{ id: 6, total: '5.50' }] }, { taxes: [{ id: 8, total: '0.49' }] }],
		};
		expect(() => assertMixedTaxTreatment(doc, 'x')).toThrow(/no untaxed line/);
	});

	test('THROWS when both taxed lines share a rate set — same class twice is not a mix', () => {
		const doc = {
			line_items: [
				{ taxes: [{ id: 6, total: '5.50' }] },
				{ taxes: [{ id: 6, total: '1.10' }] },
				{ taxes: [] },
			],
		};
		expect(() => assertMixedTaxTreatment(doc, 'x')).toThrow(/fewer than two distinct rate sets/);
	});

	test('is order-insensitive on the rate set — [6,8] and [8,6] are one signature', () => {
		const doc = {
			line_items: [
				{
					taxes: [
						{ id: 8, total: '1' },
						{ id: 6, total: '2' },
					],
				},
				{
					taxes: [
						{ id: 6, total: '2' },
						{ id: 8, total: '1' },
					],
				},
				{ taxes: [] },
			],
		};
		expect(() => assertMixedTaxTreatment(doc, 'x')).toThrow(/fewer than two distinct rate sets/);
	});
});
