// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	CHANGE_SIGNAL_IDLE_AFTER_MS,
	type ChangeSignalDecayLevel,
	changeSignalDelayMs,
	nextChangeSignalDecayLevel,
} from './tick-cadence';

describe('change-signal tick cadence', () => {
	it('applies bounded jitter around the tier interval', () => {
		expect(changeSignalDelayMs({ tierMs: 10_000, level: 0, random: () => 0 })).toBe(8_000);
		expect(changeSignalDelayMs({ tierMs: 10_000, level: 0, random: () => 0.5 })).toBe(10_000);
		expect(
			changeSignalDelayMs({ tierMs: 10_000, level: 0, random: () => 0.999_999 })
		).toBeLessThanOrEqual(12_000);
	});

	it('holds active cadence, then steps through and caps idle decay', () => {
		expect(
			nextChangeSignalDecayLevel({
				idleForMs: CHANGE_SIGNAL_IDLE_AFTER_MS - 1,
				currentLevel: 2,
			})
		).toBe(0);
		expect(
			nextChangeSignalDecayLevel({
				idleForMs: CHANGE_SIGNAL_IDLE_AFTER_MS,
				currentLevel: 0,
			})
		).toBe(1);
		expect(
			nextChangeSignalDecayLevel({
				idleForMs: CHANGE_SIGNAL_IDLE_AFTER_MS,
				currentLevel: 1,
			})
		).toBe(2);
		expect(
			nextChangeSignalDecayLevel({
				idleForMs: CHANGE_SIGNAL_IDLE_AFTER_MS,
				currentLevel: 2,
			})
		).toBe(2);
	});

	it('does not shorten a tier interval that is slower than the decay step', () => {
		expect(changeSignalDelayMs({ tierMs: 120_000, level: 1, random: () => 0.5 })).toBe(120_000);
	});

	it('keeps one idle hour within the steady-state polling budget', () => {
		const oneHourMs = 60 * 60_000;
		let nowMs = 0;
		let level: ChangeSignalDecayLevel = 0;
		let decayedTicks = 0;

		while (nowMs < oneHourMs) {
			level = nextChangeSignalDecayLevel({ idleForMs: nowMs, currentLevel: level });
			nowMs += changeSignalDelayMs({ tierMs: 10_000, level, random: () => 0.5 });
			if (nowMs <= oneHourMs) decayedTicks += 1;
		}

		const noDecayTicks = oneHourMs / 10_000;
		expect(decayedTicks).toBe(110);
		expect(decayedTicks).toBeLessThanOrEqual(120);
		expect(noDecayTicks).toBe(360);
	});
});
