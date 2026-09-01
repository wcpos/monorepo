import { describe, expect, it, vi } from 'vitest';

import { createCadenceController } from './cadence-controller';
import { createServerPressureMonitor } from './change-signal/server-pressure';
import { DEFAULT_LANE_INTERVALS, INTERVAL_LANES } from './maintenance/lane-registry';

import type { AutomaticTickGate } from './automatic-tick-gate';
import type { EngineTimers } from './engine-timers';

function harness(
	random: () => number = () => 0.5,
	visibility?: {
		hostVisible?: () => boolean;
		onHostVisibilityChange?: (listener: (visible: boolean) => void) => () => void;
	}
) {
	const timeouts: { callback: () => void; delayMs: number }[] = [];
	let nextIntervalHandle = 100;
	const timers: EngineTimers = {
		setTimeout: vi.fn((callback: () => void, delayMs: number) => {
			timeouts.push({ callback, delayMs });
			return timeouts.length as unknown as ReturnType<typeof setTimeout>;
		}),
		clearTimeout: vi.fn(),
		setInterval: vi.fn(() => nextIntervalHandle++ as unknown as ReturnType<typeof setInterval>),
		clearInterval: vi.fn(),
		unref: vi.fn(),
	};
	const intervals = { ...DEFAULT_LANE_INTERVALS };
	const diagnostics = vi.fn();
	const gate: AutomaticTickGate = { run: vi.fn(), runLane: vi.fn(), runLaneFresh: vi.fn() };
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
		...(visibility?.hostVisible === undefined ? {} : { hostVisible: visibility.hostVisible }),
		...(visibility?.onHostVisibilityChange === undefined
			? {}
			: { onHostVisibilityChange: visibility.onHostVisibilityChange }),
	});
	return { controller, diagnostics, gate, intervals, timers, timeouts };
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

	it('starts once per controller instance and treats later calls as no-ops', () => {
		const first = harness();
		const second = harness();
		first.controller.start();
		const timeoutCalls = vi.mocked(first.timers.setTimeout).mock.calls.length;
		const intervalCalls = vi.mocked(first.timers.setInterval).mock.calls.length;
		first.controller.start();
		second.controller.start();
		expect(first.timers.setTimeout).toHaveBeenCalledTimes(timeoutCalls);
		expect(first.timers.setInterval).toHaveBeenCalledTimes(intervalCalls);
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

	it('uses decay level 2 while the host is hidden', () => {
		const { controller, timeouts } = harness(() => 0.5, { hostVisible: () => false });

		controller.start();

		expect(timeouts[0]?.delayMs).toBe(60_000);
	});

	it('restores full cadence and kicks change-signal when the host becomes visible', () => {
		let visible = false;
		let visibilityListener: ((visible: boolean) => void) | undefined;
		const unsubscribe = vi.fn();
		const { controller, gate, timeouts } = harness(() => 0.5, {
			hostVisible: () => visible,
			onHostVisibilityChange: (listener) => {
				visibilityListener = listener;
				return unsubscribe;
			},
		});
		controller.start();

		visibilityListener?.(false);
		expect(timeouts).toHaveLength(1);
		visible = true;
		visibilityListener?.(true);

		expect(timeouts.map(({ delayMs }) => delayMs)).toEqual([60_000, 10_000]);
		expect(gate.runLane).toHaveBeenCalledWith('change-signal');
		controller.stop();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('pauses opportunistic intervals while hidden and re-arms them from a full interval', () => {
		let visibilityListener: ((visible: boolean) => void) | undefined;
		const { controller, intervals, timers } = harness(() => 0.5, {
			hostVisible: () => true,
			onHostVisibilityChange: (listener) => {
				visibilityListener = listener;
				return vi.fn();
			},
		});
		controller.start();
		const handleFor = (lane: (typeof INTERVAL_LANES)[number]) =>
			vi.mocked(timers.setInterval).mock.results[INTERVAL_LANES.indexOf(lane)]!.value;

		visibilityListener?.(false);

		expect(timers.clearInterval).toHaveBeenCalledWith(handleFor('order-window-seed'));
		expect(timers.clearInterval).not.toHaveBeenCalledWith(handleFor('write-drain'));
		expect(timers.clearInterval).not.toHaveBeenCalledWith(handleFor('scheduler-drain'));
		expect(controller.nextDueAtMs('order-window-seed')).toBeUndefined();
		expect(controller.nextDueAtMs('write-drain')).toBe(intervals.writeDrainPollMs);
		expect(controller.nextDueAtMs('scheduler-drain')).toBe(intervals.schedulerDrainMs);

		visibilityListener?.(true);

		expect(controller.nextDueAtMs('order-window-seed')).toBe(intervals.orderWindowSeedMs);
	});

	it('starts hidden with only runs-while-hidden intervals armed', () => {
		let visibilityListener: ((visible: boolean) => void) | undefined;
		const { controller, timers } = harness(() => 0.5, {
			hostVisible: () => false,
			onHostVisibilityChange: (listener) => {
				visibilityListener = listener;
				return vi.fn();
			},
		});

		controller.start();

		expect(timers.setInterval).toHaveBeenCalledTimes(2);
		visibilityListener?.(true);
		expect(timers.setInterval).toHaveBeenCalledTimes(INTERVAL_LANES.length);
	});

	it('clears every interval after a hidden-visible cycle', () => {
		let visibilityListener: ((visible: boolean) => void) | undefined;
		const { controller, timers } = harness(() => 0.5, {
			hostVisible: () => true,
			onHostVisibilityChange: (listener) => {
				visibilityListener = listener;
				return vi.fn();
			},
		});
		controller.start();
		visibilityListener?.(false);
		visibilityListener?.(true);

		controller.stop();

		for (const result of vi.mocked(timers.setInterval).mock.results) {
			expect(timers.clearInterval).toHaveBeenCalledWith(result.value);
		}
	});

	it('keeps the visible cadence when visibility ports are absent', () => {
		const { controller, timeouts } = harness();

		controller.start();

		expect(timeouts[0]?.delayMs).toBe(10_000);
	});
});
