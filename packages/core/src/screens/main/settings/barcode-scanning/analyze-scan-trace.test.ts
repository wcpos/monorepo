import { analyzeScanTrace, type TraceKey } from './analyze-scan-trace';

const SETTINGS = { threshold: 24, minChars: 8, prefix: '', suffix: '' };

function trace(chars: string[], gapMs: number): TraceKey[] {
	let time = 1000;
	return chars.map((key, index) => {
		if (index > 0) time += gapMs;
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

	it('handles an empty trace without crashing', () => {
		const analysis = analyzeScanTrace([], SETTINGS);

		expect(analysis.raw).toBe('');
		expect(analysis.detectedAsScan).toBe(false);
		expect(analysis.trailingEnter).toBe(false);
	});
});
