import { describe, expect, it, vi } from 'vitest';

import type { ScopeEvent } from '@wcpos/sync-core';

import { createWriteDrainLane, type WriteDrainLaneDeps } from './write-drain-lane';

/**
 * Only what a tick touches before and after `runGuarded`: a tick that throws
 * there never reaches the queue, the database or the push adapter.
 */
function laneWith(runGuarded: () => Promise<unknown>) {
	const diagnostics = vi.fn();
	let listener: (event: ScopeEvent) => void = () => undefined;
	const manager = {
		activeScope: 'scope-1',
		runGuarded,
		onEvent: (cb: (event: ScopeEvent) => void) => {
			listener = cb;
			return () => undefined;
		},
		switchTo(scopeId: string) {
			manager.activeScope = scopeId;
			listener({ type: 'switched', scopeId, epoch: 0 } as unknown as ScopeEvent);
		},
	};
	const deps = {
		connectivity: () => 'online',
		manager,
		setLastError: vi.fn(),
		diagnostics,
	} as unknown as WriteDrainLaneDeps;
	return { lane: createWriteDrainLane(deps), diagnostics, manager };
}

describe('write drain tick errors', () => {
	it('numbers consecutive crashed ticks so the log alarms only on a streak', async () => {
		let fail = true;
		const { lane, diagnostics } = laneWith(async () => {
			if (fail) throw new Error('queue read failed');
			return { lane: 'write-drain', status: 'ran', pushed: 0 };
		});

		await lane.tick();
		await lane.tick();
		fail = false;
		await lane.tick();
		fail = true;
		await lane.tick();

		expect(
			diagnostics.mock.calls
				.map(([event]) => event)
				.filter((event) => event.type === 'queue.write.tick.error')
				.map((event) => event.fields.consecutiveFailures)
		).toEqual([1, 2, 1]);
	});

	it('keeps a tick that started under the outgoing scope out of the incoming streak', async () => {
		let failures = 0;
		const { lane, diagnostics, manager } = laneWith(async () => {
			failures += 1;
			// The second tick began under scope-1 and fails after the switch.
			if (failures === 2) manager.switchTo('scope-2');
			throw new Error('queue read failed');
		});
		await lane.tick();
		await lane.tick();
		await lane.tick();
		await lane.tick();

		// The late scope-1 failure lands on scope-1's dead tracker; scope-2 counts from zero.
		expect(
			diagnostics.mock.calls
				.map(([event]) => event)
				.filter((event) => event.type === 'queue.write.tick.error')
				.map((event) => event.fields.consecutiveFailures)
		).toEqual([1, 2, 1, 2]);
	});

	it('starts a return to the first scope at zero after another scope ran in between', async () => {
		let fail = true;
		const { lane, diagnostics, manager } = laneWith(async () => {
			if (fail) throw new Error('queue read failed');
			return { lane: 'write-drain', status: 'ran', pushed: 0 };
		});

		await lane.tick();
		await lane.tick();
		manager.switchTo('scope-2');
		fail = false;
		await lane.tick();
		manager.switchTo('scope-1');
		fail = true;
		await lane.tick();

		expect(
			diagnostics.mock.calls
				.map(([event]) => event)
				.filter((event) => event.type === 'queue.write.tick.error')
				.map((event) => event.fields.consecutiveFailures)
		).toEqual([1, 2, 1]);
	});
});
