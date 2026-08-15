import { analyzeScanTrace } from './analyze-trace';

import type { TraceKey } from './wedge-detector';

const SETTINGS = { threshold: 24, minChars: 8, prefix: '', suffix: '' };

function trace(chars: string[], gapMs: number): TraceKey[] {
	let time = 1000;
	return chars.map((key, index) => {
		if (index > 0) time += gapMs;
		return { key, timeMs: time };
	});
}

// Build a trace from explicit [key, gapBeforeThisKey] pairs.
function tracePairs(pairs: [string, number][]): TraceKey[] {
	let time = 1000;
	return pairs.map(([key, gap], index) => {
		if (index > 0) time += gap;
		return { key, timeMs: time };
	});
}

describe('analyzeScanTrace', () => {
	it('detects a fast scanner burst as a scan', () => {
		const analysis = analyzeScanTrace(trace('9310988001234'.split(''), 13), SETTINGS);

		expect(analysis.detectedAsScan).toBe(true);
		expect(analysis.code).toBe('9310988001234');
		expect(analysis.avgGapMs).toBe(13);
		expect(analysis.tooShort).toBe(false);
		expect(analysis.suggestions).toEqual([]);
	});

	it('flags a slow scanner as a near-miss and suggests raising the threshold', () => {
		const analysis = analyzeScanTrace(trace('9310988001234'.split(''), 32), SETTINGS);

		expect(analysis.detectedAsScan).toBe(false);
		expect(analysis.nearMiss).toBe(true);
		expect(analysis.suggestions).toEqual([
			{
				kind: 'raise-threshold',
				value: 40,
				patch: { barcode_scanning_avg_time_input_threshold: 40 },
			},
		]);
	});

	it('treats human typing as typing with no suggestions', () => {
		const analysis = analyzeScanTrace(trace(['H', 'L', '-', '1', '5'], 220), SETTINGS);

		expect(analysis.detectedAsScan).toBe(false);
		expect(analysis.nearMiss).toBe(false);
		expect(analysis.suggestions).toEqual([]);
	});

	it('suggests a prefix for a scanner that always sends a leading symbol', () => {
		const keys = trace(['*', ...'9310988001234'.split(''), 'Enter'], 13);
		const analysis = analyzeScanTrace(keys, SETTINGS);

		expect(analysis.detectedAsScan).toBe(true);
		expect(analysis.leadingSymbol).toBe('*');
		expect(analysis.trailingEnter).toBe(true);
		expect(analysis.suggestions).toEqual([
			{ kind: 'set-prefix', value: '*', patch: { barcode_scanning_prefix: '*' } },
		]);
	});

	it('does not re-suggest a prefix that is already configured (and strips it)', () => {
		const keys = trace(['*', ...'9310988001234'.split('')], 13);
		const analysis = analyzeScanTrace(keys, { ...SETTINGS, prefix: '*' });

		expect(analysis.code).toBe('9310988001234');
		expect(analysis.suggestions).toEqual([]);
	});

	it('suggests lowering the minimum length for a short PLU at scan speed', () => {
		const analysis = analyzeScanTrace(trace(['4', '0', '1', '1'], 13), SETTINGS);

		expect(analysis.detectedAsScan).toBe(true);
		expect(analysis.tooShort).toBe(true);
		expect(analysis.suggestions).toEqual([
			{ kind: 'lower-min-chars', value: 4, patch: { barcode_scanning_min_chars: 4 } },
		]);
	});

	it('flags Shift-mangled uppercase traces', () => {
		const keys = trace(['Shift', 'H', 'Shift', 'L', '-', '1', '5'], 12);
		const analysis = analyzeScanTrace(keys, SETTINGS);

		expect(analysis.shiftMangled).toBe(true);
		expect(analysis.raw).toBe('HL-15');
	});

	it('handles a single-key trace without crashing', () => {
		const analysis = analyzeScanTrace(trace(['9'], 0), SETTINGS);

		expect(analysis.detectedAsScan).toBe(false);
		expect(analysis.avgGapMs).toBe(Number.POSITIVE_INFINITY);
		expect(analysis.suggestions).toEqual([]);
	});

	it('agrees with the detector when a late gap folds the running average under threshold', () => {
		// Gaps of 40ms then 10ms: a whole-trace mean is 25ms (> 24ms, "typing"),
		// but the detector's folded average dips to 10ms and latches a scan. The
		// analyzer must not report typing or recommend raising a working threshold.
		const keys = tracePairs([
			['1', 0],
			['2', 40],
			['3', 10],
			['4', 10],
			['5', 10],
			['6', 10],
			['7', 10],
			['8', 10],
			['9', 10],
			['0', 10],
		]);
		const analysis = analyzeScanTrace(keys, SETTINGS);

		expect(analysis.detectedAsScan).toBe(true);
		expect(analysis.suggestions.some((s) => s.kind === 'raise-threshold')).toBe(false);
	});

	it('keeps a multi-character prefix that the detector cannot strip', () => {
		// The detector only strips a prefix that equals the single first key, so a
		// `**` prefix is never removed. The panel must show the same uncleaned code.
		const keys = trace(['*', '*', ...'99999999'.split('')], 13);
		const analysis = analyzeScanTrace(keys, { ...SETTINGS, prefix: '**' });

		expect(analysis.detectedAsScan).toBe(true);
		expect(analysis.code).toBe('**99999999');
	});

	it('lowers the minimum length to the actual short code so the fix resolves the scan', () => {
		const analysis = analyzeScanTrace(trace(['4', '2'], 13), SETTINGS);

		expect(analysis.detectedAsScan).toBe(true);
		expect(analysis.tooShort).toBe(true);
		// value must be the code length (2), not clamped to a higher floor that
		// would leave the barcode still below the minimum.
		expect(analysis.suggestions).toEqual([
			{ kind: 'lower-min-chars', value: 2, patch: { barcode_scanning_min_chars: 2 } },
		]);
	});

	it('handles an empty trace without crashing', () => {
		const analysis = analyzeScanTrace([], SETTINGS);

		expect(analysis.raw).toBe('');
		expect(analysis.detectedAsScan).toBe(false);
		expect(analysis.trailingEnter).toBe(false);
	});
});
