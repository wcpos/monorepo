import { expect, test } from '@playwright/test';

import { expectRateSetParity, expectTaxParity } from './order-lifecycle';

/**
 * Unit-style pins for the money-oracle helpers — no page, no store. These exist
 * because both helpers have now each shipped one JS-coercion hole
 * (`Number('') === 0`): expectTaxParity's missing-client pass (#1114 review)
 * and expectRateSetParity's blank-rate_id-as-rate-0 (#1116 review, wcpos-bot
 * escalation). Coercion edges get pinned here, where a red is cheap, instead
 * of surfacing as a false-green parity assertion against a live store.
 */
test.describe('expectRateSetParity', () => {
	test('accepts matching numeric rate sets in any order and spelling', () => {
		expectRateSetParity(
			[{ rate_id: 13 }, { rate_id: '14' }],
			[{ rate_id: '14' }, { rate_id: 13 }],
			'spelling/order'
		);
	});

	test('treats missing arrays as the empty set (tax-free stores)', () => {
		expectRateSetParity(undefined, undefined, 'empty');
		expectRateSetParity([], undefined, 'empty vs missing');
	});

	test('fails on a set mismatch', () => {
		expect(() =>
			expectRateSetParity([{ rate_id: 13 }], [{ rate_id: 7 }, { rate_id: 10 }], 'mismatch')
		).toThrow();
	});

	test('rejects a BLANK rate_id instead of coercing it to rate 0', () => {
		// Number('') === 0 and Number('  ') === 0 — both finite. Without the
		// non-blank guard these pass as rate "0" and can collide with a real 0.
		expect(() => expectRateSetParity([{ rate_id: '' }], [{ rate_id: 0 }], 'blank')).toThrow();
		expect(() =>
			expectRateSetParity([{ rate_id: '  ' }], [{ rate_id: 0 }], 'whitespace')
		).toThrow();
	});

	test('rejects missing and non-numeric rate ids on either side', () => {
		expect(() => expectRateSetParity([{}], [{}], 'missing')).toThrow();
		expect(() =>
			expectRateSetParity([{ rate_id: 'abc' }], [{ rate_id: 'abc' }], 'non-numeric')
		).toThrow();
	});
});

test.describe('expectTaxParity', () => {
	test('accepts equality and the one-microunit tie at full width', () => {
		expectTaxParity('4.575163', '4.575164', 'tie');
		expectTaxParity('1.640000', '1.64', 'padding');
	});

	test('rejects a missing client value instead of coercing it to zero', () => {
		expect(() => expectTaxParity('0', '', 'missing client')).toThrow();
		expect(() => expectTaxParity('0', undefined, 'undefined client')).toThrow();
	});

	test('rejects two microunits and display-money drift', () => {
		expect(() => expectTaxParity('4.575162', '4.575164', 'two microunits')).toThrow();
		expect(() => expectTaxParity('1.65', '1.64', 'a whole cent')).toThrow();
	});
});
