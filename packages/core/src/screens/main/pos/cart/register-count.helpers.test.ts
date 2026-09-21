import { createTestT } from '../../../../../jest/translate';
import {
	countVariance,
	denominationTotal,
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
	expect(varianceText(countVariance(cash, '480.80'), format, t)).toBe(text);
});
it.each([
	['', -1750, false],
	['   ', 1750, false],
	['5.00', -1750, true],
	['5.00', 1750, true],
	['5.00', 499, false],
	['5.00', 500, false],
])('threshold %s / %s', (threshold, variance, result) => {
	expect(overThreshold(variance, threshold)).toBe(result);
});
it('totals denominations in minor units', () => {
	expect(denominationTotal({ '20': 2, '0.50': 3 })).toBe(4150);
});
it.each(['', ' ', '-1', 'no', 'Infinity', '1e2'])('rejects invalid amount %s', (value) =>
	expect(validAmount(value)).toBe(false)
);
it('accepts fractional and zero amounts but rejects overflow', () => {
	expect(validAmount('.50')).toBe(true);
	expect(validAmount('0')).toBe(true);
	expect(validAmount('9'.repeat(400))).toBe(false);
});
