import { fromMinor } from '@wcpos/order-math';

import { createTestT } from '../../../../../jest/translate';
import {
	countDecimals,
	countVariance,
	denominationTotal,
	mayAbandonCount,
	overThreshold,
	validAmount,
	varianceText,
} from './register-count.helpers';
const t = createTestT();
const format = (n: number) => `£${n.toFixed(2)}`;
it.each([
	['463.30', '−£17.50 short'],
	['483.80', '+£3.00 over'],
	['480.80', 'Exact'],
])('formats %s', (cash, text) => {
	expect(varianceText(countVariance(cash, '480.80', 2), 2, format, t)).toBe(text);
});
it.each([
	['', -1750, false],
	['   ', 1750, false],
	['5.00', -1750, true],
	['5.00', 1750, true],
	['5.00', 499, false],
	['5.00', 500, false],
])('threshold %s / %s', (threshold, variance, result) => {
	expect(overThreshold(variance, 2, threshold)).toBe(result);
});
it('totals denominations in minor units', () => {
	expect(denominationTotal({ '20': 2, '0.50': 3 }, 2)).toBe(4150);
	expect(denominationTotal({ '1': 2, '0.005': 3 }, 3)).toBe(2015);
});
it.each(['', ' ', '-1', 'no', 'Infinity', '1e2'])('rejects invalid amount %s', (value) =>
	expect(validAmount(value, 2)).toBe(false)
);
it('accepts fractional and zero amounts but rejects overflow', () => {
	expect(validAmount('.50', 2)).toBe(true);
	expect(validAmount('0', 2)).toBe(true);
	expect(validAmount('9'.repeat(400), 2)).toBe(false);
});
it('counts a 3-place currency in its own minor unit', () => {
	expect(countVariance('1.254', '1.250', 3)).toBe(4);
	expect(varianceText(countVariance('1.254', '1.250', 3), 3, (n) => n.toFixed(3), t)).toBe(
		'+0.004 over'
	);
	expect(overThreshold(4, 3, '0.003')).toBe(true);
});
it.each([
	[0, 2],
	[1, 2],
	[2, 2],
	[3, 3],
	[null, 2],
	[undefined, 2],
])('counts a %s-place store in %s places', (priceDecimals, places) => {
	expect(countDecimals(priceDecimals)).toBe(places);
});
it('counts coins on a store that shows no decimals', () => {
	expect(fromMinor(denominationTotal({ '0.25': 4 }, countDecimals(0)), countDecimals(0))).toBe(
		'1.00'
	);
});
it.each([
	['counting', false, true],
	['counting', true, true],
	['open', true, false],
	['closed', true, true],
	['open', false, false],
	['closed', false, false],
])('leaving the count at %s (refused %s) abandons it: %s', (status, refused, result) => {
	expect(mayAbandonCount({ status }, refused)).toBe(result);
});
