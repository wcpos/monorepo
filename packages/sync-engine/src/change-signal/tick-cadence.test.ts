// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	CHANGE_SIGNAL_IDLE_AFTER_MS,
	type ChangeSignalDecayLevel,
	changeSignalDelayMs,
	changeSignalPressureCeilingMs,
	changeSignalSteadyIntervalMs,
	maxChangeSignalPressureMultiplier,
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

describe('change-signal server-pressure composition', () => {
	it('gives every shipped preset a ceiling it can actually reach', () => {
		// Realtime / Balanced / Eco, and a slower-than-Eco Custom setting.
		expect(changeSignalPressureCeilingMs(10_000)).toBe(300_000);
		expect(changeSignalPressureCeilingMs(60_000)).toBe(300_000);
		expect(changeSignalPressureCeilingMs(300_000)).toBe(600_000);

		for (const tierMs of [10_000, 60_000, 300_000]) {
			const top = maxChangeSignalPressureMultiplier(tierMs);
			expect(top).toBeGreaterThan(1);
			expect(changeSignalSteadyIntervalMs({ tierMs, level: 0, pressureMultiplier: top })).toBe(
				changeSignalPressureCeilingMs(tierMs)
			);
		}
	});

	it('multiplies the tier and clamps at the ceiling', () => {
		expect(changeSignalSteadyIntervalMs({ tierMs: 10_000, level: 0 })).toBe(10_000);
		expect(changeSignalSteadyIntervalMs({ tierMs: 10_000, level: 0, pressureMultiplier: 4 })).toBe(
			40_000
		);
		expect(changeSignalSteadyIntervalMs({ tierMs: 60_000, level: 0, pressureMultiplier: 32 })).toBe(
			300_000
		);
	});

	it('composes with idle decay by multiplying, not replacing', () => {
		// 10s tier decayed to the 60s idle step, then doubled by pressure.
		expect(changeSignalSteadyIntervalMs({ tierMs: 10_000, level: 2, pressureMultiplier: 1 })).toBe(
			60_000
		);
		expect(changeSignalSteadyIntervalMs({ tierMs: 10_000, level: 2, pressureMultiplier: 2 })).toBe(
			120_000
		);
		// Idle decay alone never exceeds its own step; pressure alone never sees it.
		expect(changeSignalSteadyIntervalMs({ tierMs: 10_000, level: 1, pressureMultiplier: 4 })).toBe(
			120_000
		);
	});

	it('keeps jitter under pressure', () => {
		expect(
			changeSignalDelayMs({ tierMs: 10_000, level: 0, pressureMultiplier: 4, random: () => 0 })
		).toBe(32_000);
		expect(
			changeSignalDelayMs({ tierMs: 10_000, level: 0, pressureMultiplier: 4, random: () => 0.5 })
		).toBe(40_000);
		expect(
			changeSignalDelayMs({ tierMs: 10_000, level: 0, pressureMultiplier: 4, random: () => 1 })
		).toBe(48_000);
	});

	it('never fires before a server-issued Retry-After, and spreads registers after it', () => {
		// The floor dominates a much shorter tier delay…
		expect(
			changeSignalDelayMs({
				tierMs: 10_000,
				level: 0,
				retryAfterForMs: 120_000,
				random: () => 0,
			})
		).toBe(120_000);
		// …with the herd spread added ON TOP, never subtracted from the floor.
		expect(
			changeSignalDelayMs({
				tierMs: 10_000,
				level: 0,
				retryAfterForMs: 120_000,
				random: () => 1,
			})
		).toBe(150_000);
		// A floor shorter than the pressured cadence changes nothing.
		expect(
			changeSignalDelayMs({
				tierMs: 60_000,
				level: 0,
				pressureMultiplier: 4,
				retryAfterForMs: 5_000,
				random: () => 0.5,
			})
		).toBe(240_000);
	});
});
