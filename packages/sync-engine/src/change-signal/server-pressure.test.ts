// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	createServerPressureMonitor,
	parseRetryAfterMs,
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

	it('never parks the till for longer than the sanity clamp, and never negative', () => {
		expect(parseRetryAfterMs('86400', 0)).toBe(15 * 60_000);
		expect(parseRetryAfterMs(new Date(0).toUTCString(), 60_000)).toBe(0);
	});
});

describe('server pressure monitor', () => {
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
