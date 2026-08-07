import { describe, expect, it, vi } from 'vitest';

import { createCadenceController } from './cadence-controller';
import { createServerPressureMonitor } from './change-signal/server-pressure';
import { DEFAULT_LANE_INTERVALS } from './maintenance/lane-registry';

import type { AutomaticTickGate } from './automatic-tick-gate';
import type { EngineTimers } from './engine-timers';

function harness(random: () => number = () => 0.5) {
	const timeouts: { callback: () => void; delayMs: number }[] = [];
	const timers: EngineTimers = {
		setTimeout: vi.fn((callback: () => void, delayMs: number) => {
			timeouts.push({ callback, delayMs });
			return timeouts.length as unknown as ReturnType<typeof setTimeout>;
		}),
		clearTimeout: vi.fn(),
		setInterval: vi.fn(() => 100 as unknown as ReturnType<typeof setInterval>),
		clearInterval: vi.fn(),
		unref: vi.fn(),
	};
	const intervals = { ...DEFAULT_LANE_INTERVALS };
	const diagnostics = vi.fn();
	const gate: AutomaticTickGate = { run: vi.fn(), runLane: vi.fn() };
	const controller = createCadenceController({
		mode: 'auto',
		intervals,
		pressure: createServerPressureMonitor(),
		now: () => 0,
		random,
		diagnostics,
		timers,
		onStatusChange: vi.fn(),
		gate,
		startedAtMs: 0,
		isDisposed: () => false,
		laneIsArmable: () => true,
	});
	return { controller, diagnostics, intervals, timers, timeouts };
}

describe('createCadenceController', () => {
	it('never redraws a backoff earlier than the armed deadline', () => {
		const draws = [1, 0];
		const { controller, timeouts } = harness(() => draws.shift() ?? 0);
		controller.start();
		expect(timeouts[0]!.delayMs).toBe(12_000);
		controller.onServerPressureTransition({
			direction: 'backoff',
			signal: 'server-error',
			fromMultiplier: 1,
			toMultiplier: 1,
		});
		expect(timeouts[1]!.delayMs).toBe(12_000);
	});

	it('announces cadence start once per controller instance', () => {
		const first = harness();
		const second = harness();
		first.controller.start();
		first.controller.start();
		second.controller.start();
		expect(
			first.diagnostics.mock.calls.filter(([event]) => event.type === 'cadence.start')
		).toHaveLength(1);
		expect(
			second.diagnostics.mock.calls.filter(([event]) => event.type === 'cadence.start')
		).toHaveLength(1);
	});

	it('mutates the shared intervals object during reconfiguration', () => {
		const { controller, intervals } = harness();
		controller.reconfigure({ changeSignalPollMs: 60_000 });
		expect(intervals.changeSignalPollMs).toBe(60_000);
	});

	it('does not unref cadence timers', () => {
		const { controller, timers } = harness();
		controller.start();
		expect(timers.unref).not.toHaveBeenCalled();
	});
});
