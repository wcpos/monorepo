import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWriteDrainNudge, WRITE_DRAIN_NUDGE_DELAY_MS } from './write-drain-nudge';

describe('createWriteDrainNudge', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function nudgeWith(overrides?: {
		isOffline?: () => boolean;
		enabled?: () => boolean;
		delayMs?: number;
	}) {
		const runLane = vi.fn();
		const nudge = createWriteDrainNudge({
			runLane,
			isOffline: overrides?.isOffline ?? (() => false),
			enabled: overrides?.enabled ?? (() => true),
			...(overrides?.delayMs !== undefined ? { delayMs: overrides.delayMs } : {}),
		});
		return { runLane, nudge };
	}

	it('coalesces a burst into one lane run, first-edge — no later nudge extends the delay', () => {
		const { runLane, nudge } = nudgeWith();
		nudge.nudge();
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS - 1);
		nudge.nudge();
		nudge.nudge();
		expect(runLane).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(runLane).toHaveBeenCalledTimes(1);
	});

	it('re-arms after firing so a later edit gets its own kick', () => {
		const { runLane, nudge } = nudgeWith();
		nudge.nudge();
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS);
		nudge.nudge();
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS);
		expect(runLane).toHaveBeenCalledTimes(2);
	});

	it('drops nudges while offline — the reconnect re-tick owns that path', () => {
		let offline = true;
		const { runLane, nudge } = nudgeWith({ isOffline: () => offline });
		nudge.nudge();
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS);
		expect(runLane).not.toHaveBeenCalled();

		// A nudge armed online that fires after connectivity dropped stands down too.
		offline = false;
		nudge.nudge();
		offline = true;
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS);
		expect(runLane).not.toHaveBeenCalled();
	});

	it('drops nudges when disabled (manual mode / disposed engine)', () => {
		const { runLane, nudge } = nudgeWith({ enabled: () => false });
		nudge.nudge();
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS);
		expect(runLane).not.toHaveBeenCalled();
	});

	it('dispose cancels a pending kick and refuses new ones', () => {
		const { runLane, nudge } = nudgeWith();
		nudge.nudge();
		nudge.dispose();
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS);
		nudge.nudge();
		vi.advanceTimersByTime(WRITE_DRAIN_NUDGE_DELAY_MS);
		expect(runLane).not.toHaveBeenCalled();
	});
});
