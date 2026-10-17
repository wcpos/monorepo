import { describe, expect, it, vi } from 'vitest';

import { createWriteDrainLane, type WriteDrainLaneDeps } from './write-drain-lane';

/**
 * Only what a tick touches before and after `runGuarded`: a tick that throws
 * there never reaches the queue, the database or the push adapter.
 */
function laneWith(runGuarded: () => Promise<unknown>) {
	const diagnostics = vi.fn();
	const deps = {
		connectivity: () => 'online',
		manager: { activeScope: 'scope-1', runGuarded },
		setLastError: vi.fn(),
		diagnostics,
	} as unknown as WriteDrainLaneDeps;
	return { lane: createWriteDrainLane(deps), diagnostics };
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
});
