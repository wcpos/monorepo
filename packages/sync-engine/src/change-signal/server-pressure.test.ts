// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	createServerPressureMonitor,
	parseRetryAfterMs,
	parseServerLoad1m,
	type ServerPressureMonitor,
} from './server-pressure';

const OK = { status: 200, durationMs: 40 };

function healthy(monitor: ServerPressureMonitor, count: number, atMs = 0): void {
	for (let index = 0; index < count; index += 1) {
		monitor.observe({ atMs: atMs + index, ...OK });
	}
}

describe('parseRetryAfterMs', () => {
	it('reads delta-seconds and HTTP-dates, and rejects junk', () => {
		expect(parseRetryAfterMs('120', 1_000)).toBe(120_000);
		expect(parseRetryAfterMs(' 5 ', 1_000)).toBe(5_000);
		expect(parseRetryAfterMs(new Date(61_000).toUTCString(), 1_000)).toBe(60_000);
		expect(parseRetryAfterMs(null, 0)).toBeNull();
		expect(parseRetryAfterMs('', 0)).toBeNull();
		expect(parseRetryAfterMs('soon', 0)).toBeNull();
	});

	it('rejects Date.parse-lenient values that are not HTTP-date shaped (B10)', () => {
		// An ISO stamp Date.parses fine but is not an HTTP-date — treating it as
		// valid would block the error-body mirror fallback behind a delay the
		// server never named. (All-digit strings are valid DELAY-SECONDS.)
		expect(parseRetryAfterMs('2026-08-21T12:00:00Z', 1_000)).toBeNull();
		expect(parseRetryAfterMs('0.5', 1_000)).toBeNull();
	});

	it('accepts the obsolete rfc850 HTTP-date form', () => {
		// 06-Nov-94 is in the past relative to any modern atMs, so a valid parse
		// clamps to 0 rather than null.
		expect(parseRetryAfterMs('Sunday, 06-Nov-94 08:49:37 GMT', Date.UTC(2026, 0, 1))).toBe(0);
		// A FUTURE rfc850 date yields the positive delay, not just the clamp.
		const target = Date.UTC(2026, 7, 21, 12, 0, 0); // a Friday
		expect(parseRetryAfterMs('Friday, 21-Aug-26 12:00:00 GMT', target - 90_000)).toBe(90_000);
	});

	it('rejects date-shaped values whose calendar components do not round-trip', () => {
		// Date.parse NORMALIZES these (31-Nov becomes 1 Dec; weekday mismatches
		// are ignored) — honouring them would trust a delay the server never
		// named instead of falling back to the body mirror.
		expect(parseRetryAfterMs('Sunday, 31-Nov-94 08:49:37 GMT', 0)).toBeNull();
		expect(parseRetryAfterMs('Monday, 06-Nov-94 08:49:37 GMT', 0)).toBeNull();
		expect(parseRetryAfterMs('Mon Nov 31 08:49:37 1994', 0)).toBeNull();
	});

	it('never parks the till for longer than the sanity clamp, and never negative', () => {
		expect(parseRetryAfterMs('86400', 0)).toBe(15 * 60_000);
		expect(parseRetryAfterMs(new Date(0).toUTCString(), 60_000)).toBe(0);
	});
});

describe('parseServerLoad1m', () => {
	it('reads the one-minute value from a finite load triple', () => {
		expect(parseServerLoad1m('[0.5,0.3,0.2]')).toBe(0.5);
	});

	it.each([
		undefined,
		null,
		'not-json',
		'{"load":0.5}',
		'[0.5,0.3]',
		'["0.5",0.3,0.2]',
		'[0.5,null,0.2]',
		'[0.5,0.3,null]',
		'[0,0,0]',
	])('ignores an absent, malformed, or unknown load value (%s)', (value) => {
		expect(parseServerLoad1m(value)).toBeUndefined();
	});
});

describe('server pressure monitor', () => {
	it('uses EWMA ratio and floor thresholds before entering soft pressure', () => {
		const floorMonitor = createServerPressureMonitor({ maxMultiplier: 8 });
		floorMonitor.observe({ atMs: 0, ...OK, serverLoad1m: 0.4 });
		expect(floorMonitor.observe({ atMs: 1, ...OK, serverLoad1m: 0.9 })).toBeNull();
		expect(floorMonitor.observe({ atMs: 2, ...OK, serverLoad1m: 0.9 })).toBeNull();
		expect(floorMonitor.observe({ atMs: 3, ...OK, serverLoad1m: 1 })).toBeNull();
		expect(floorMonitor.observe({ atMs: 4, ...OK, serverLoad1m: 1 })).toMatchObject({
			direction: 'backoff',
			signal: 'server-pressure',
			fromMultiplier: 1,
			toMultiplier: 2,
			serverLoad1m: 1,
			serverLoadBaseline1m: expect.any(Number),
		});

		const ratioMonitor = createServerPressureMonitor({ maxMultiplier: 8 });
		ratioMonitor.observe({ atMs: 0, ...OK, serverLoad1m: 1 });
		expect(ratioMonitor.observe({ atMs: 1, ...OK, serverLoad1m: 1.99 })).toBeNull();
		expect(ratioMonitor.observe({ atMs: 2, ...OK, serverLoad1m: 2.3 })).toBeNull();
		expect(ratioMonitor.observe({ atMs: 3, ...OK, serverLoad1m: 2.5 })).toMatchObject({
			direction: 'backoff',
			toMultiplier: 2,
		});
	});

	it('requires two samples in both hysteresis directions without backing maintenance off', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, ...OK, serverLoad1m: 0.5 });

		expect(monitor.observe({ atMs: 1, ...OK, serverLoad1m: 1.2 })).toBeNull();
		expect(monitor.isBackingOff(1)).toBe(false);
		expect(monitor.observe({ atMs: 2, ...OK, serverLoad1m: 1.2 })).toMatchObject({
			direction: 'backoff',
			toMultiplier: 2,
		});
		expect(monitor.multiplier()).toBe(2);
		expect(monitor.isBackingOff(2)).toBe(false);

		expect(monitor.observe({ atMs: 3, ...OK, serverLoad1m: 0.5 })).toBeNull();
		expect(monitor.multiplier()).toBe(2);
		expect(monitor.observe({ atMs: 4, ...OK, serverLoad1m: 0.5 })).toMatchObject({
			direction: 'recovery',
			fromMultiplier: 2,
			toMultiplier: 1,
		});
		expect(monitor.multiplier()).toBe(1);
		expect(monitor.isBackingOff(4)).toBe(false);
	});

	it('freezes the baseline during an active spike so sustained load cannot read as recovery', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, ...OK, serverLoad1m: 0.5 });
		monitor.observe({ atMs: 1, ...OK, serverLoad1m: 1.2 });
		expect(monitor.observe({ atMs: 2, ...OK, serverLoad1m: 1.2 })).toMatchObject({
			direction: 'backoff',
		});

		// 30 more hot samples: an unfrozen EWMA would acclimatize (~21 samples)
		// and declare recovery at full load. Frozen, the spike never reads as over.
		for (let sample = 0; sample < 30; sample += 1) {
			expect(monitor.observe({ atMs: 3 + sample, ...OK, serverLoad1m: 1.2 })).toBeNull();
			expect(monitor.multiplier()).toBe(2);
		}

		// Actual recovery — load returns toward the pre-spike baseline.
		monitor.observe({ atMs: 40, ...OK, serverLoad1m: 0.5 });
		expect(monitor.observe({ atMs: 41, ...OK, serverLoad1m: 0.5 })).toMatchObject({
			direction: 'recovery',
			toMultiplier: 1,
		});
	});

	it('keeps the soft-load machine running while hard pressure owns the multiplier', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, ...OK, serverLoad1m: 0.4 });
		monitor.observe({ atMs: 1, ...OK, serverLoad1m: 1.2 });
		expect(monitor.observe({ atMs: 2, ...OK, serverLoad1m: 1.2 })).toMatchObject({
			direction: 'backoff',
			signal: 'server-pressure',
		});

		// Hard pressure arrives under an active soft tier: the step to x2 is
		// real but invisible (MAX composition — from==to), never a shortening.
		expect(monitor.observe({ atMs: 3, status: 429, durationMs: 20 })).toBeNull();
		expect(monitor.isBackingOff(3)).toBe(true);
		expect(monitor.multiplier()).toBe(2);

		// Samples keep feeding the machine during the hard window: the spike
		// ends silently (from==to again), and the multiplier stays owned by
		// the hard tier — no false recovery row, no starved baseline.
		expect(monitor.observe({ atMs: 4, ...OK, serverLoad1m: 0.4 })).toBeNull();
		expect(monitor.observe({ atMs: 5, ...OK, serverLoad1m: 0.4 })).toBeNull();
		expect(monitor.multiplier()).toBe(2);
		expect(monitor.isBackingOff(5)).toBe(true);
	});

	it('observes load before the accepted high-pressure early return', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, ...OK, pressure: 'high', serverLoad1m: 0.4 });
		monitor.observe({ atMs: 1, ...OK, pressure: 'high', serverLoad1m: 1.2 });
		expect(monitor.observe({ atMs: 2, ...OK, pressure: 'high', serverLoad1m: 1.2 })).toMatchObject({
			direction: 'backoff',
			signal: 'server-pressure',
			fromMultiplier: 1,
			toMultiplier: 2,
		});
	});

	it('keeps a load transition when the same response trips the slow window', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 200, durationMs: 2_001, serverLoad1m: 0.4 });
		for (let sample = 1; sample < 8; sample += 1) {
			monitor.observe({ atMs: sample, status: 200, durationMs: 2_001 });
		}
		monitor.observe({ atMs: 8, status: 200, durationMs: 2_001, serverLoad1m: 1.2 });
		expect(
			monitor.observe({ atMs: 9, status: 200, durationMs: 2_001, serverLoad1m: 1.2 })
		).toMatchObject({
			direction: 'backoff',
			signal: 'server-pressure',
			fromMultiplier: 1,
			toMultiplier: 2,
		});

		for (let sample = 0; sample < 10; sample += 1) {
			expect(monitor.observe({ atMs: 60_000 + sample, ...OK })).toBeNull();
		}
		expect(monitor.multiplier()).toBe(2);
	});

	it('learns zero as a valid first baseline and still triggers via the absolute floor', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		// [0,x,y] passes the parser by design — only the exact [0,0,0] fallback
		// is no-signal — so a genuinely idle server seeds baseline 0.
		monitor.observe({ atMs: 0, ...OK, serverLoad1m: 0 });
		expect(monitor.observe({ atMs: 1, ...OK, serverLoad1m: 1 })).toBeNull();
		expect(monitor.observe({ atMs: 2, ...OK, serverLoad1m: 1 })).toMatchObject({
			direction: 'backoff',
			toMultiplier: 2,
		});
	});

	it('keeps simultaneous hard pressure authoritative and does not shorten it', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, ...OK, serverLoad1m: 0.4 });
		monitor.observe({ atMs: 1, ...OK, serverLoad1m: 1.1 });
		expect(
			monitor.observe({ atMs: 2, status: 429, durationMs: 20, serverLoad1m: 1.1 })
		).toMatchObject({ signal: 'rate-limited', fromMultiplier: 1, toMultiplier: 2 });
		expect(monitor.isBackingOff(2)).toBe(true);

		monitor.observe({ atMs: 3, ...OK, serverLoad1m: 1.1 });
		monitor.observe({ atMs: 4, ...OK, serverLoad1m: 1.1 });
		monitor.observe({ atMs: 5, ...OK, serverLoad1m: 0.4 });
		expect(monitor.observe({ atMs: 6, ...OK, serverLoad1m: 0.4 })).toBeNull();
		expect(monitor.multiplier()).toBe(2);
		expect(monitor.isBackingOff(6)).toBe(true);
	});

	it('reports whether maintenance should defer for a raised cadence or active Retry-After floor', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		expect(monitor.isBackingOff(0)).toBe(false);

		monitor.observe({ atMs: 1_000, status: 503, durationMs: 20, retryAfter: '5' });
		expect(monitor.isBackingOff(5_999)).toBe(true);
		expect(monitor.isBackingOff(6_000)).toBe(false);

		monitor.observe({ atMs: 7_000, status: 429, durationMs: 20 });
		expect(monitor.isBackingOff(100_000)).toBe(true);
	});

	it('backs off on a single 429 and honours Retry-After as a floor', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		const transition = monitor.observe({
			atMs: 10_000,
			status: 429,
			durationMs: 30,
			retryAfter: '90',
		});

		expect(transition).toMatchObject({
			direction: 'backoff',
			signal: 'rate-limited',
			fromMultiplier: 1,
			toMultiplier: 2,
		});
		expect(monitor.multiplier()).toBe(2);
		expect(monitor.retryAfterUntilMs()).toBe(100_000);
	});

	it('only ever moves the Retry-After floor forward', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5, retryAfter: '120' });
		monitor.observe({ atMs: 1_000, status: 503, durationMs: 5, retryAfter: '1' });
		expect(monitor.retryAfterUntilMs()).toBe(120_000);
	});

	it('needs a three-strike burst before a 5xx or timeout counts as distress', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		expect(monitor.observe({ atMs: 0, status: 500, durationMs: 20 })).toBeNull();
		expect(monitor.observe({ atMs: 1_000, status: 502, durationMs: 20 })).toBeNull();
		expect(monitor.observe({ atMs: 2_000, status: 500, durationMs: 20 })).toMatchObject({
			direction: 'backoff',
			signal: 'server-error',
			toMultiplier: 2,
		});
	});

	it('classifies a status-0 burst as a timeout signal and respects the rolling window', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 0, durationMs: 30_000 });
		monitor.observe({ atMs: 1_000, status: 0, durationMs: 30_000 });
		// Outside the 60s window — the two above have aged out, so this is strike one.
		expect(monitor.observe({ atMs: 90_000, status: 0, durationMs: 30_000 })).toBeNull();
		monitor.observe({ atMs: 91_000, status: 0, durationMs: 30_000 });
		expect(monitor.observe({ atMs: 92_000, status: 0, durationMs: 30_000 })).toMatchObject({
			signal: 'timeout',
			toMultiplier: 2,
		});
	});

	it('ignores transport failures while the device itself is offline', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		for (let index = 0; index < 10; index += 1) {
			expect(
				monitor.observe({ atMs: index * 100, status: 0, durationMs: 5, offline: true })
			).toBeNull();
		}
		expect(monitor.multiplier()).toBe(1);
	});

	it('treats a sustained slow median as pressure, then needs a fresh window', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		let transition = null;
		for (let index = 0; index < 10; index += 1) {
			transition = monitor.observe({ atMs: index, status: 200, durationMs: 2_500 });
		}
		expect(transition).toMatchObject({ signal: 'slow', toMultiplier: 2 });
		// The window was consumed with the step, so the very next slow response cannot step again.
		expect(monitor.observe({ atMs: 20, status: 200, durationMs: 5_000 })).toBeNull();
		expect(monitor.multiplier()).toBe(2);
	});

	it('does not trip on a single slow outlier among fast responses', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		for (let index = 0; index < 9; index += 1) {
			monitor.observe({ atMs: index, status: 200, durationMs: 50 });
		}
		expect(monitor.observe({ atMs: 9, status: 200, durationMs: 30_000 })).toBeNull();
		expect(monitor.multiplier()).toBe(1);
	});

	it('leaves missing pressure readings as a complete no-op', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		for (let index = 0; index < 10; index += 1) {
			expect(monitor.observe({ atMs: index, status: 200, durationMs: 50 })).toBeNull();
		}
		expect(monitor.multiplier()).toBe(1);
	});

	it('backs off once after a sustained high pressure window', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		let transition = null;
		for (let index = 0; index < 10; index += 1) {
			transition = monitor.observe({
				atMs: index,
				status: 200,
				durationMs: 50,
				pressure: 'high',
			});
		}

		expect(transition).toMatchObject({
			direction: 'backoff',
			signal: 'server-pressure',
			fromMultiplier: 1,
			toMultiplier: 2,
		});
		expect(monitor.multiplier()).toBe(2);
	});

	it('does not back off on a single high pressure reading', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		expect(monitor.observe({ atMs: 0, status: 200, durationMs: 50, pressure: 'high' })).toBeNull();
		expect(monitor.multiplier()).toBe(1);
	});

	it('counts low pressure readings toward recovery like healthy responses', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5 });

		let transition = null;
		for (let index = 0; index < 10; index += 1) {
			transition = monitor.observe({
				atMs: 60_000 + index,
				status: 200,
				durationMs: 50,
				pressure: 'low',
			});
		}

		expect(transition).toMatchObject({
			direction: 'recovery',
			signal: 'healthy',
			fromMultiplier: 2,
			toMultiplier: 1,
		});
	});

	it('treats elevated pressure as neutral recovery evidence', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5 });

		for (let index = 0; index < 10; index += 1) {
			expect(
				monitor.observe({
					atMs: 60_000 + index,
					status: 200,
					durationMs: 50,
					pressure: 'elevated',
				})
			).toBeNull();
		}
		expect(monitor.multiplier()).toBe(2);
	});

	it('treats high pressure as neutral recovery evidence before the median trips', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5 });
		expect(
			monitor.observe({ atMs: 60_000, status: 200, durationMs: 50, pressure: 'high' })
		).toBeNull();

		for (let index = 0; index < 9; index += 1) {
			expect(
				monitor.observe({ atMs: 60_001 + index, status: 200, durationMs: 50, pressure: 'low' })
			).toBeNull();
		}
		expect(monitor.multiplier()).toBe(2);
		expect(
			monitor.observe({ atMs: 60_010, status: 200, durationMs: 50, pressure: 'low' })
		).toMatchObject({ direction: 'recovery', fromMultiplier: 2, toMultiplier: 1 });
	});

	it('does not read a non-429 4xx as either distress or health', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		for (let index = 0; index < 30; index += 1) {
			expect(monitor.observe({ atMs: index, status: 404, durationMs: 10 })).toBeNull();
		}
		expect(monitor.multiplier()).toBe(1);
	});

	it('climbs the ladder no further than its top', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		for (let index = 0; index < 10; index += 1) {
			monitor.observe({ atMs: index * 1_000, status: 429, durationMs: 5 });
		}
		expect(monitor.multiplier()).toBe(8);
	});

	it('reports an extended pause at the ladder top, but stays silent when nothing moved', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 2 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5 });
		expect(monitor.multiplier()).toBe(2);
		expect(
			monitor.observe({ atMs: 1_000, status: 429, durationMs: 5, retryAfter: '30' })
		).toMatchObject({
			direction: 'backoff',
			fromMultiplier: 2,
			toMultiplier: 2,
			retryAfterUntilMs: 31_000,
		});
		expect(monitor.observe({ atMs: 2_000, status: 429, durationMs: 5 })).toBeNull();
	});

	it('recovers gradually — one halving per ten clean responses, never in one jump', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5 });
		monitor.observe({ atMs: 1_000, status: 429, durationMs: 5 });
		monitor.observe({ atMs: 2_000, status: 429, durationMs: 5 });
		expect(monitor.multiplier()).toBe(8);

		const afterDwell = 2_000 + 60_000;
		healthy(monitor, 9, afterDwell);
		expect(monitor.multiplier()).toBe(8);
		expect(monitor.observe({ atMs: afterDwell + 100, ...OK })).toMatchObject({
			direction: 'recovery',
			signal: 'healthy',
			fromMultiplier: 8,
			toMultiplier: 4,
		});

		healthy(monitor, 10, afterDwell + 1_000);
		expect(monitor.multiplier()).toBe(2);
		healthy(monitor, 10, afterDwell + 2_000);
		expect(monitor.multiplier()).toBe(1);
		// At rest, clean traffic produces no further transitions to log.
		expect(monitor.observe({ atMs: afterDwell + 5_000, ...OK })).toBeNull();
	});

	it('will not undo a back-off with responses that were already in flight', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 100_000, status: 429, durationMs: 5 });
		expect(monitor.multiplier()).toBe(2);

		// Twenty clean responses one second later: plenty of COUNT, no elapsed time.
		// Without the dwell this would flap straight back to ×1.
		healthy(monitor, 20, 101_000);
		expect(monitor.multiplier()).toBe(2);

		healthy(monitor, 10, 100_000 + 60_000);
		expect(monitor.multiplier()).toBe(1);
	});

	it('does not call itself recovered while the server-named pause is still running', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5, retryAfter: '600' });
		expect(monitor.retryAfterUntilMs()).toBe(600_000);

		// Past the dwell, plenty of healthy traffic — but still inside the pause.
		healthy(monitor, 30, 120_000);
		expect(monitor.multiplier()).toBe(2);

		healthy(monitor, 10, 600_001);
		expect(monitor.multiplier()).toBe(1);
	});

	it('clears stale strikes on recovery so an old 5xx cannot bounce it back', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5 });
		// Two strikes that never made a burst.
		monitor.observe({ atMs: 1_000, status: 500, durationMs: 20 });
		monitor.observe({ atMs: 2_000, status: 500, durationMs: 20 });

		healthy(monitor, 10, 70_000);
		expect(monitor.multiplier()).toBe(1);

		// A single 5xx must now be strike ONE again, not the third of a stale burst.
		expect(monitor.observe({ atMs: 71_000, status: 500, durationMs: 20 })).toBeNull();
		expect(monitor.multiplier()).toBe(1);
	});

	it('restarts the recovery streak on any distress', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		monitor.observe({ atMs: 0, status: 429, durationMs: 5 });
		healthy(monitor, 9, 1_000);
		monitor.observe({ atMs: 5_000, status: 500, durationMs: 20 });
		healthy(monitor, 9, 6_000);
		expect(monitor.multiplier()).toBe(2);
	});

	it('reports a 503 pause even when the burst threshold is not met', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 8 });
		// Strike one: the ladder does not move, but the server named a 60s pause and
		// the cadence layer MUST hear about it or an armed tick fires straight through.
		expect(
			monitor.observe({ atMs: 10_000, status: 503, durationMs: 20, retryAfter: '60' })
		).toMatchObject({
			direction: 'backoff',
			signal: 'server-error',
			fromMultiplier: 1,
			toMultiplier: 1,
			retryAfterUntilMs: 70_000,
		});
		expect(monitor.retryAfterUntilMs()).toBe(70_000);
		// A 503 with no pause and no burst stays silent.
		expect(monitor.observe({ atMs: 11_000, status: 503, durationMs: 20 })).toBeNull();
	});

	it('lowers a multiplier that is above a newly shortened ladder', () => {
		const monitor = createServerPressureMonitor({ maxMultiplier: 32 });
		for (let index = 0; index < 6; index += 1) {
			monitor.observe({ atMs: index * 1_000, status: 429, durationMs: 5 });
		}
		expect(monitor.multiplier()).toBe(32);
		monitor.setMaxMultiplier(2);
		expect(monitor.multiplier()).toBe(2);
	});
});
