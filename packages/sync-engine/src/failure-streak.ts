/**
 * Consecutive failures of one lane (or one request kind), for the cashier log
 * to tell a retried attempt from a failure that persists.
 *
 * Scoped. Lanes outlive a store or cashier switch, so every count belongs to
 * the scope the failing work STARTED under — the caller captures it when the
 * tick or request begins and passes it to both `fail` and `reset`:
 *  - a failure under the active scope that is not the streak's scope starts
 *    the streak over, so scope A's failures never make scope B's first read as
 *    its third, and a return to A never revives A's old count;
 *  - a failure or success from a scope that is no longer active (a tick or
 *    request that completed after the switch) never touches the tracker — a
 *    late failure cannot inflate the incoming scope's count, nor a late success
 *    clear it.
 */
export type ScopedFailureStreak = {
	/** Count one failure of work started under `scopeId`; returns the streak, this one included. */
	fail(scopeId: string | null): number;
	/** Work started under `scopeId` worked: ends that scope's streak. */
	reset(scopeId: string | null): void;
};

export function createScopedFailureStreak(activeScope: () => string | null): ScopedFailureStreak {
	let count = 0;
	let streakScopeId: string | null = null;
	return {
		fail(scopeId) {
			// Stale work reports itself as a lone failure and leaves the tracker alone.
			if (scopeId !== activeScope()) return 1;
			if (scopeId !== streakScopeId) {
				count = 0;
				streakScopeId = scopeId;
			}
			count += 1;
			return count;
		},
		reset(scopeId) {
			if (scopeId === streakScopeId) count = 0;
		},
	};
}
