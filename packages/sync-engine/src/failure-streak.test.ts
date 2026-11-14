import { describe, expect, it } from 'vitest';

import type { ScopeEvent } from '@wcpos/sync-core';

import { scopeBoundFailureStreak } from './failure-streak';

function fakeManager() {
	let listener: (event: ScopeEvent) => void = () => undefined;
	return {
		onEvent: (cb: (event: ScopeEvent) => void) => {
			listener = cb;
			return () => undefined;
		},
		switchTo: (scopeId: string) =>
			listener({ type: 'switched', scopeId, epoch: 0 } as unknown as ScopeEvent),
	};
}

describe('scopeBoundFailureStreak', () => {
	it('counts failures in a row, and work that worked starts over', () => {
		const streak = scopeBoundFailureStreak(fakeManager())();
		expect([streak.fail(), streak.fail()]).toEqual([1, 2]);
		streak.reset();
		expect(streak.fail()).toBe(1);
	});

	it('starts every activation at zero, a return to an earlier scope included', () => {
		const manager = fakeManager();
		const streaks = scopeBoundFailureStreak(manager);
		streaks().fail();
		streaks().fail();
		manager.switchTo('b');
		expect(streaks().fail()).toBe(1);
		manager.switchTo('a');
		// Back in A after B: A's two old failures are gone with A's old instance.
		expect(streaks().fail()).toBe(1);
	});

	it('lets work in flight at a switch touch only the instance it started with', () => {
		const manager = fakeManager();
		const streaks = scopeBoundFailureStreak(manager);
		const outgoing = streaks();
		manager.switchTo('b');
		streaks().fail();
		streaks().fail();
		// A scope-A tick that settles after the switch: a late failure or success
		// lands on A's dead instance, never on B's count.
		outgoing.fail();
		outgoing.reset();
		expect(streaks().fail()).toBe(3);
	});
});
