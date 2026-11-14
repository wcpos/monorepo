import { createTestT } from '../../../jest/translate';
import { closureResult, resultAmount, resultOf, resultText, resultWord } from './closure-result';

const t = createTestT();
type Map = Record<string, string>;
const figures = (cash: { expected?: string; counted?: string; variance?: string }) => ({
	expected: (cash.expected === undefined ? {} : { cash: cash.expected }) as Map,
	counted: (cash.counted === undefined ? {} : { cash: cash.counted }) as Map,
	variance: (cash.variance === undefined ? {} : { cash: cash.variance }) as Map,
});

// Revert: a sign test on the float instead of the minor units, or one tone for exact and over.
it.each([
	[2, '99.00', '100.00', -100, 'short', 'bad'],
	[2, '100.01', '100.00', 1, 'over', 'ok'],
	[2, '100.00', '100.00', 0, 'exact', 'muted'],
	[0, '99', '100', -1, 'short', 'bad'],
	[0, '101', '100', 1, 'over', 'ok'],
	[0, '100', '100', 0, 'exact', 'muted'],
	// Rounding edges: each figure rounds to the decimals before the subtraction.
	[2, '100.004', '100.00', 0, 'exact', 'muted'],
	[2, '100.005', '100.00', 1, 'over', 'ok'],
	[0, '99.6', '100', 0, 'exact', 'muted'],
	[0, '99.4', '100', -1, 'short', 'bad'],
] as const)(
	'settles counted %s less expected %s at %i decimals',
	(decimals, counted, expected, minor, kind, tone) => {
		expect(closureResult({ settled: figures({ counted, expected }) }, decimals)).toEqual({
			minor,
			kind,
			tone,
		});
	}
);

// Revert: recompute counted less expected for a recorded closure that wrote its variance.
it.each([
	['-1.0000', -10000, 'short'],
	['0.0001', 1, 'over'],
	['0.0000', 0, 'exact'],
] as const)(
	'reads the recorded variance %s as written, not counted less expected',
	(v, minor, kind) => {
		const row = figures({ expected: '100.0000', counted: '100.0000', variance: v });
		expect(closureResult({ recorded: row }, 4)).toMatchObject({ minor, kind });
	}
);

it('recorded: an expected tender nobody counted is short by all of it; with no expectation, no result', () => {
	expect(closureResult({ recorded: figures({ expected: '40.0000' }) }, 4)).toMatchObject({
		minor: -400000,
		kind: 'short',
	});
	expect(closureResult({ recorded: figures({ counted: '5.0000' }) }, 4)).toBeNull();
	expect(closureResult({ recorded: figures({}) }, 4, 'card')).toBeNull();
});

it('recorded closures sum, one with no result adding nothing; none is exact', () => {
	const rows = [figures({ variance: '-0.1' }), figures({ variance: '0.3' }), figures({})];
	expect(closureResult({ recorded: rows }, 4)).toEqual(resultOf(2000));
	expect(closureResult({ recorded: [] }, 4)).toEqual(resultOf(0));
	expect(resultAmount(resultOf(-2000), 4)).toBe(0.2);
});

it.each([
	['short', 'label', 'Short'],
	['over', 'label', 'Over'],
	['exact', 'label', 'Exact'],
	['short', 'after', 'short'],
	['over', 'after', 'over'],
	['exact', 'after', 'Exact'],
	['short', 'register', 'short'],
	['exact', 'register', 'Exact'],
] as const)('words a %s result for %s', (kind, style, word) => {
	expect(resultWord(kind, t, style)).toBe(word);
});

it('leads the line with its amount, and says Exact alone', () => {
	expect(resultText(resultOf(-100), '$1.00', t)).toBe('$1.00 short');
	expect(resultText(resultOf(100), '+$1.00', t, 'register')).toBe('+$1.00 over');
	expect(resultText(resultOf(0), '$0.00', t)).toBe('Exact');
});
