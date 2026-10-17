import { describe, expect, it } from 'vitest';

import { createScopedFailureStreak } from './failure-streak';

describe('createScopedFailureStreak', () => {
	it('counts failures in a row, and a run that worked starts over', () => {
		const streak = createScopedFailureStreak();
		expect([streak.fail('a'), streak.fail('a')]).toEqual([1, 2]);
		streak.reset();
		expect(streak.fail('a')).toBe(1);
	});

	it('starts over when the failure belongs to another scope', () => {
		const streak = createScopedFailureStreak();
		streak.fail('a');
		streak.fail('a');
		// Two failures against scope A must not make scope B's first read as its third.
		expect(streak.fail('b')).toBe(1);
		// …nor may a return to A revive A's old count.
		expect(streak.fail('a')).toBe(1);
	});
});
