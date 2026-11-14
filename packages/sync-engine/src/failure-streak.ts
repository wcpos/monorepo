import type { StoreScopeManager } from '@wcpos/sync-core';

/**
 * Consecutive failures of one lane (or one request kind), for the cashier log
 * to tell a retried attempt from a failure that persists. A plain counter: all
 * scope isolation comes from REPLACING it, never from bookkeeping inside it.
 */
export type FailureStreak = {
	/** Count one failure; returns the streak, this one included. */
	fail(): number;
	/** The work succeeded: the streak ends. */
	reset(): void;
};

export function createFailureStreak(): FailureStreak {
	let count = 0;
	return {
		fail: () => (count += 1),
		reset: () => {
			count = 0;
		},
	};
}

/**
 * A streak that is replaced by a brand-new one on every scope activation (a
 * store or cashier change — the cashier is part of the scope id). Read it ONCE
 * when a tick or request starts and settle that same instance: work still in
 * flight at a switch then only ever touches a dead instance, every new scope —
 * including a return to an old one — starts at zero, and no completion can
 * reach into another scope's count.
 */
export function scopeBoundFailureStreak(
	manager: Pick<StoreScopeManager, 'onEvent'>
): () => FailureStreak {
	let current = createFailureStreak();
	manager.onEvent((event) => {
		if (event.type === 'switched') current = createFailureStreak();
	});
	return () => current;
}
