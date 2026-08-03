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
});

describe('trend points', () => {
	const { summarizeLast24h } = loadLogic();
	const now = 100 * HOUR_MS;
	const bucket = (
		hoursAgo: number,
		requests: number,
		load?: number
	): Parameters<typeof summarizeLast24h>[0][number] => ({
		hourStartMs: now - hoursAgo * HOUR_MS,
		requests,
		bytes: 0,
		durationTotalMs: 0,
		durationCount: 0,
		errors: 0,
		...(load === undefined ? {} : { loadLast: load, loadMax: load }),
	});

	it('gives both charts nothing to plot on a fresh till', () => {
		const summary = summarizeLast24h([], now);
		expect(summary.requestPoints).toEqual([]);
		expect(summary.loadPoints).toEqual([]);
	});

	it('plots one point per measured hour, oldest first', () => {
		const summary = summarizeLast24h([bucket(2, 10, 0.5), bucket(1, 20, 1.5)], now);
		expect(summary.requestPoints).toEqual([
			{ x: now - 2 * HOUR_MS, y: 10 },
			{ x: now - HOUR_MS, y: 20 },
		]);
		expect(summary.loadPoints).toEqual([
			{ x: now - 2 * HOUR_MS, y: 0.5 },
			{ x: now - HOUR_MS, y: 1.5 },
		]);
	});

	it('keeps load-only buckets out of the request trend', () => {
		// recordServerLoad can open an hour's bucket before any request lands in
		// it — plotting that as zero requests would draw a dip that never happened.
		const summary = summarizeLast24h([bucket(2, 0, 0.5), bucket(1, 20, 1.5)], now);
		expect(summary.requestPoints).toEqual([{ x: now - HOUR_MS, y: 20 }]);
		expect(summary.loadPoints).toHaveLength(2);
	});

	it('omits hours with no load reading from the load trend', () => {
		const summary = summarizeLast24h([bucket(2, 10), bucket(1, 20, 1.5)], now);
		expect(summary.loadPoints).toEqual([{ x: now - HOUR_MS, y: 1.5 }]);
		expect(summary.requestPoints).toHaveLength(2);
	});

	it('a server that never reports load leaves the load trend empty', () => {
		// The screen shows its distinct "doesn't report its load" message for this,
		// not the trend frame's "not enough data yet".
		const summary = summarizeLast24h([bucket(2, 10), bucket(1, 20)], now);
		expect(summary.loadPoints).toEqual([]);
		expect(summary.requestPoints).toHaveLength(2);
	});

	it('drops points older than the 24 hour window', () => {
		const summary = summarizeLast24h([bucket(30, 999, 9), bucket(1, 20, 1.5)], now);
		expect(summary.requestPoints).toEqual([{ x: now - HOUR_MS, y: 20 }]);
		expect(summary.loadPoints).toEqual([{ x: now - HOUR_MS, y: 1.5 }]);
	});
});

describe('deriveUptimeCells', () => {
	const { deriveUptimeCells } = loadLogic();
	const HOUR = 60 * 60 * 1000;
	const now = 30 * HOUR + 123; // mid-hour, hour 30

	const bucket = (hourIndex: number, requests: number, errors = 0) => ({
		hourStartMs: hourIndex * HOUR,
		requests,
		bytes: 0,
		durationTotalMs: 0,
		durationCount: 0,
		errors,
	});

	it('emits one cell per trailing hour, newest last', () => {
		const cells = deriveUptimeCells([bucket(30, 12)], now, 24);
		expect(cells).toHaveLength(24);
		expect(cells.at(-1)).toMatchObject({ hourStartMs: 30 * HOUR, state: 'running' });
		expect(cells[0].hourStartMs).toBe(7 * HOUR);
	});

	it('classifies hours: requests → running, errors → errors, nothing → closed', () => {
		const cells = deriveUptimeCells([bucket(29, 100), bucket(30, 50, 3)], now, 3);
		expect(cells.map((cell) => cell.state)).toEqual(['closed', 'running', 'errors']);
		expect(cells[2]).toMatchObject({ requests: 50, errors: 3 });
	});
});
