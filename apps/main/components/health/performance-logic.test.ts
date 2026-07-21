function loadLogic(): typeof import('./performance-logic') {
	jest.resetModules();
	return jest.requireActual('./performance-logic');
}

const HOUR_MS = 60 * 60 * 1000;

describe('performance page logic', () => {
	it('matches presets exactly and reports custom otherwise', () => {
		const { presetFor } = loadLogic();
		expect(presetFor(60_000, 25)).toBe('eco');
		expect(presetFor(10_000, 50)).toBe('balanced');
		expect(presetFor(5_000, 100)).toBe('realtime');
		expect(presetFor(10_000, 25)).toBe('custom');
		expect(presetFor(45_000, 50)).toBe('custom');
	});

	it('summarizes only the last 24 hours of buckets', () => {
		const { summarizeLast24h } = loadLogic();
		const now = 100 * HOUR_MS;
		const bucket = (hoursAgo: number, requests: number) => ({
			hourStartMs: now - hoursAgo * HOUR_MS,
			requests,
			bytes: requests * 1000,
			durationTotalMs: requests * 100,
			durationCount: requests,
			errors: 0,
		});
		const summary = summarizeLast24h([bucket(30, 999), bucket(20, 10), bucket(1, 20)], now);
		expect(summary.requests).toBe(30);
		expect(summary.typicalMs).toBe(100);
		expect(summary.errors).toBe(0);
	});

	it('reports no typical response and no server minutes without data', () => {
		const { summarizeLast24h } = loadLogic();
		const summary = summarizeLast24h([], 0);
		expect(summary.requests).toBe(0);
		expect(summary.typicalMs).toBeNull();
		expect(summary.serverMinutes).toBeNull();
	});

	it('keeps load-only buckets out of the POS request trend', () => {
		const { summarizeLast24h, trendDisplay } = loadLogic();
		const now = 3 * HOUR_MS;
		const summary = summarizeLast24h(
			[HOUR_MS, 2 * HOUR_MS].map((hourStartMs) => ({
				hourStartMs,
				requests: 0,
				bytes: 0,
				durationTotalMs: 0,
				durationCount: 0,
				errors: 0,
				loadLast: 0.5,
				loadMax: 0.5,
			})),
			now
		);

		expect(summary.requestPoints).toEqual([]);
		expect(trendDisplay(summary.requestPoints)).toMatchObject({
			mode: 'placeholder',
			latest: null,
		});
	});
});

describe('trend display', () => {
	const real = (ys: number[]) => ys.map((y, i) => ({ x: i * HOUR_MS, y }));

	it('draws the real trend once there are two or more samples', () => {
		const { trendDisplay } = loadLogic();
		const points = real([10, 20, 30]);
		const display = trendDisplay(points);
		expect(display.mode).toBe('chart');
		expect(display.points).toEqual(points);
		expect(display.latest).toBe(30);
	});

	it('falls back to a placeholder when there is no data at all', () => {
		const { trendDisplay } = loadLogic();
		const display = trendDisplay([]);
		expect(display.mode).toBe('placeholder');
		// A placeholder still has to be drawable, so it needs a line's worth of points.
		expect(display.points.length).toBeGreaterThanOrEqual(2);
		// Nothing was measured, so there is no value to report.
		expect(display.latest).toBeNull();
	});

	it('falls back to a placeholder for a single sample but keeps the real value', () => {
		const { trendDisplay } = loadLogic();
		const display = trendDisplay(real([42]));
		expect(display.mode).toBe('placeholder');
		expect(display.points.length).toBeGreaterThanOrEqual(2);
		// One genuine point is not a trend, but its value is still true.
		expect(display.latest).toBe(42);
	});

	it('never derives placeholder points from the real sample', () => {
		const { trendDisplay } = loadLogic();
		const lonely = trendDisplay(real([9999]));
		const empty = trendDisplay([]);
		// The drawn shape must not encode the measurement, or it would read as data.
		expect(lonely.points).toEqual(empty.points);
		expect(lonely.points.some((point) => point.y === 9999)).toBe(false);
	});

	it('produces a deterministic placeholder shape', () => {
		const { trendDisplay } = loadLogic();
		expect(trendDisplay([]).points).toEqual(trendDisplay([]).points);
	});

	it('keeps placeholder points out of the measured summary', () => {
		const { trendDisplay, summarizeLast24h } = loadLogic();
		// The placeholder is a rendering concern only — the summary of no buckets
		// must stay empty no matter what the chart chose to draw.
		expect(trendDisplay([]).mode).toBe('placeholder');
		const summary = summarizeLast24h([], 0);
		expect(summary.requests).toBe(0);
		expect(summary.recent).toEqual([]);
	});
});
