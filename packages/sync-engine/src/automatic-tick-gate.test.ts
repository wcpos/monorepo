import { describe, expect, it, vi } from 'vitest';

import { createAutomaticTickGate } from './automatic-tick-gate';

import type { EngineConnectivity, EngineLane, SyncReport } from './create-rxdb-sync-engine';

const report = (lane: EngineLane): SyncReport => ({ lane, status: 'ran' });

describe('createAutomaticTickGate', () => {
	it('drops automatic ticks while lifecycle work is pending', async () => {
		const tickLane = vi.fn().mockResolvedValue(report('change-signal'));
		const gate = createAutomaticTickGate({
			isGated: () => true,
			connectivity: () => 'online',
			now: () => 0,
			diagnostics: vi.fn(),
			onStatusChange: vi.fn(),
			tickLane,
			recordTick: vi.fn(),
			seedRetickLanes: [],
		});
		await gate.runLane('change-signal');
		expect(tickLane).not.toHaveBeenCalled();
	});

	it('records the tick with its start time', async () => {
		const recordTick = vi.fn();
		const tickReport = report('change-signal');
		const gate = createAutomaticTickGate({
			isGated: () => false,
			connectivity: () => 'online',
			now: () => 25,
			diagnostics: vi.fn(),
			onStatusChange: vi.fn(),
			tickLane: vi.fn().mockResolvedValue(tickReport),
			recordTick,
			seedRetickLanes: [],
		});
		await gate.runLane('change-signal');
		expect(recordTick).toHaveBeenCalledWith(tickReport, 25);
	});

	it('coalesces concurrent automatic ticks for the same lane', async () => {
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tickLane = vi.fn(async (lane: EngineLane) => {
			await held;
			return report(lane);
		});
		const gate = createAutomaticTickGate({
			isGated: () => false,
			connectivity: () => 'online',
			now: () => 0,
			diagnostics: vi.fn(),
			onStatusChange: vi.fn(),
			tickLane,
			recordTick: vi.fn(),
			seedRetickLanes: [],
		});

		const first = gate.runLane('existence-prime');
		const second = gate.runLane('existence-prime');
		expect(tickLane).toHaveBeenCalledTimes(1);
		release();
		await Promise.all([first, second]);
	});

	it('reports a rejected lane tick without rejecting the automatic path', async () => {
		const diagnostics = vi.fn();
		const now = vi.fn().mockReturnValueOnce(25).mockReturnValue(40);
		const gate = createAutomaticTickGate({
			isGated: () => false,
			connectivity: () => 'online',
			now,
			diagnostics,
			onStatusChange: vi.fn(),
			tickLane: vi.fn().mockRejectedValue(new Error('lane exploded')),
			recordTick: vi.fn(),
			seedRetickLanes: [],
		});

		await expect(gate.runLane('change-signal')).resolves.toBeUndefined();
		expect(diagnostics).toHaveBeenCalledWith({
			type: 'engine.lane.tick',
			level: 'error',
			message: 'automatic tick failed: lane exploded',
			fields: { lane: 'change-signal', status: 'error', durationMs: 15 },
		});
	});

	it('reticks seeds before drains on an offline-to-online edge', async () => {
		let connectivity: EngineConnectivity = 'offline';
		const lanes: EngineLane[] = [];
		const tickLane = vi.fn(async (lane: EngineLane) => {
			lanes.push(lane);
			return report(lane);
		});
		const gate = createAutomaticTickGate({
			isGated: () => false,
			connectivity: () => connectivity,
			now: () => 0,
			diagnostics: vi.fn(),
			onStatusChange: vi.fn(),
			tickLane,
			recordTick: vi.fn(),
			seedRetickLanes: ['reference-seed'],
		});
		await gate.runLane('change-signal');
		connectivity = 'online';
		await gate.runLane('change-signal');
		await vi.waitFor(() => expect(lanes).toContain('write-drain'));
		expect(lanes.indexOf('reference-seed')).toBeLessThan(lanes.indexOf('scheduler-drain'));
		expect(lanes.indexOf('scheduler-drain')).toBeLessThan(lanes.indexOf('write-drain'));
	});
});
