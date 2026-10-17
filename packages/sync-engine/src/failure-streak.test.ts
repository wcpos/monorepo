import { describe, expect, it } from 'vitest';

import { createScopedFailureStreak } from './failure-streak';

describe('createScopedFailureStreak', () => {
	it('counts failures in a row, and work that worked starts over', () => {
		const streak = createScopedFailureStreak(() => 'a');
		expect([streak.fail('a'), streak.fail('a')]).toEqual([1, 2]);
		streak.reset('a');
		expect(streak.fail('a')).toBe(1);
	});

	it('starts over under another scope, and a return never revives the old count', () => {
		let active = 'a';
		const streak = createScopedFailureStreak(() => active);
		streak.fail('a');
		streak.fail('a');
		active = 'b';
		// Two failures against scope A must not make scope B's first read as its third.
		expect(streak.fail('b')).toBe(1);
		active = 'a';
		expect(streak.fail('a')).toBe(1);
	});

	it('never lets late work from the outgoing scope touch the incoming streak', () => {
		let active = 'a';
		const streak = createScopedFailureStreak(() => active);
		active = 'b';
		streak.fail('b');
		streak.fail('b');
		// A scope-A tick that completes after the switch: a late failure must not
		// make B's next failure its fourth, nor a late success clear B's two.
		expect(streak.fail('a')).toBe(1);
		streak.reset('a');
		expect(streak.fail('b')).toBe(3);
	});
});
