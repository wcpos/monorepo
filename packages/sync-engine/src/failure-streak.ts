/**
 * Consecutive failures of one lane, for the cashier log to tell a retried
 * attempt from a failure that persists. Scoped: lanes outlive a store or
 * cashier switch, and a streak earned against the outgoing scope must not make
 * the incoming scope's first failure read as its third (nor a return to an old
 * scope revive a stale count), so a failure under a different scope starts over.
 */
export type ScopedFailureStreak = {
	/** Count one failure under `scopeId`; returns the streak, this one included. */
	fail(scopeId: string | null): number;
	/** A run that worked ends the streak. */
	reset(): void;
};

export function createScopedFailureStreak(): ScopedFailureStreak {
	let count = 0;
	let streakScopeId: string | null = null;
	return {
		fail(scopeId) {
			if (scopeId !== streakScopeId) {
				count = 0;
				streakScopeId = scopeId;
			}
			count += 1;
			return count;
		},
		reset() {
			count = 0;
		},
	};
}
