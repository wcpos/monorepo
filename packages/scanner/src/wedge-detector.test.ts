import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createWedgeDetector,
	replayWedgeDetector,
	type TraceKey,
	WEDGE_END_OF_SCAN_MS,
} from './wedge-detector';

const SETTINGS = { threshold: 24, prefix: '', suffix: '' };

function trace(chars: string[], gapMs: number, startMs = 1000): TraceKey[] {
	let time = startMs;
	return chars.map((key, index) => {
		if (index > 0) time += gapMs;
		return { key, timeMs: time };
	});
}

describe('replayWedgeDetector', () => {
	it('latches a fast burst and reports the folded average', () => {
		const result = replayWedgeDetector(trace('9310988001234'.split(''), 13), SETTINGS);
		expect(result.detectedAsScan).toBe(true);
		expect(result.code).toBe('9310988001234');
		expect(result.minAvgGapMs).toBeLessThan(SETTINGS.threshold);
	});

	it('rejects typing-speed input', () => {
		const result = replayWedgeDetector(trace(['H', 'L', '-', '1', '5'], 220), SETTINGS);
		expect(result.detectedAsScan).toBe(false);
		expect(result.code).toBe('');
	});

	it('strips a configured single-key prefix and suffix only at the edges', () => {
		const keys = trace(['*', ...'12345678'.split(''), '#'], 13);
		const result = replayWedgeDetector(keys, { threshold: 24, prefix: '*', suffix: '#' });
		expect(result.code).toBe('12345678');
	});
});

describe('createWedgeDetector (streaming)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function stream(keys: TraceKey[], settings = { ...SETTINGS }) {
		const scans: string[] = [];
		const detector = createWedgeDetector({
			getSettings: () => settings,
			onScan: (code) => scans.push(code),
		});
		for (const entry of keys) {
			vi.setSystemTime(entry.timeMs);
			detector.handleKey(entry.key, entry.timeMs);
		}
		vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
		return { scans, detector };
	}

	it('emits a fast burst after the end-of-scan settle', () => {
		const { scans } = stream(trace('9310988001234'.split(''), 13));
		expect(scans).toEqual(['9310988001234']);
	});

	it('does not emit for typing-speed input', () => {
		const { scans } = stream(trace(['H', 'L', '-', '1', '5'], 220));
		expect(scans).toEqual([]);
	});

	it('emits two separate bursts as two scans', () => {
		const first = trace('11111111'.split(''), 13, 1000);
		const detectorState = { ...SETTINGS };
		const scans: string[] = [];
		const detector = createWedgeDetector({
			getSettings: () => detectorState,
			onScan: (code) => scans.push(code),
		});
		for (const entry of first) {
			vi.setSystemTime(entry.timeMs);
			detector.handleKey(entry.key, entry.timeMs);
		}
		vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
		const second = trace('22222222'.split(''), 13, 10_000);
		for (const entry of second) {
			vi.setSystemTime(entry.timeMs);
			detector.handleKey(entry.key, entry.timeMs);
		}
		vi.advanceTimersByTime(WEDGE_END_OF_SCAN_MS);
		expect(scans).toEqual(['11111111', '22222222']);
	});

	it('agrees with the replay for every shared fixture', () => {
		const fixtures: {
			keys: TraceKey[];
			settings: { threshold: number; prefix: string; suffix: string };
		}[] = [
			{ keys: trace('9310988001234'.split(''), 13), settings: { ...SETTINGS } },
			{ keys: trace(['H', 'L', '-', '1', '5'], 220), settings: { ...SETTINGS } },
			{
				keys: trace(['*', ...'12345678'.split(''), '#'], 13),
				settings: { threshold: 24, prefix: '*', suffix: '#' },
			},
			// The folded-average latch case: mean says typing, the fold latches.
			{
				keys: [40, 10, 10, 10, 10, 10, 10, 10, 10].reduce<TraceKey[]>(
					(acc, gap, index) => {
						const prev = acc[acc.length - 1];
						acc.push({ key: String(index % 10), timeMs: prev.timeMs + gap });
						return acc;
					},
					[{ key: '9', timeMs: 1000 }]
				),
				settings: { ...SETTINGS },
			},
		];

		for (const fixture of fixtures) {
			const replay = replayWedgeDetector(fixture.keys, fixture.settings);
			const { scans } = stream(fixture.keys, fixture.settings);
			expect(scans.length > 0).toBe(replay.detectedAsScan);
			if (replay.detectedAsScan) {
				expect(scans[0]).toBe(replay.code);
			}
		}
	});
});
