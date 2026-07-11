/**
 * Auth session coordinator (roadmap P1-3) — the PURE decision spine for
 * token-authenticated requests. NO fetch, NO DOM, NO timers: the transport and
 * the token refresh are injected, so the same 401/403 + single-flight-refresh
 * policy is decided once, in sync-core, behind a locked contract (the same
 * upstream-into-sync-core move the hybrid engine and the apply tree made).
 *
 * Three hard-fought 1.9.x learnings are encoded here:
 *   - **401 vs 403** (bug dbd912750, regression-catalog row 14): only a 401 means
 *     "token stale, refresh"; a 403 is a PERMISSION error. The old client refreshed
 *     on 403 too and looped until the token corrupted. Here a 403 surfaces
 *     immediately as `AuthForbiddenError` and NEVER triggers a refresh.
 *   - **Single-flight refresh** (regression-catalog row 16): a burst of concurrent
 *     401s must coalesce to ONE refresh, not a stampede of N parallel refreshes.
 *   - **Generation guard**: single-flight alone only coalesces 401s that arrive
 *     WHILE a refresh is in flight. A *staggered* stale 401 — a request that left
 *     with the old token and returns 401 AFTER the shared refresh already settled —
 *     would otherwise start its own redundant refresh, re-creating the stampede.
 *     Each attempt captures the refresh generation before it runs; if another lane
 *     has already refreshed since then, the attempt retries with the fresh token
 *     instead of refreshing again.
 *
 * Refreshes are BOUNDED (`maxRefreshAttempts`, default 1): if a 401 persists after
 * this lane refreshed, the request fails with `AuthRefreshExhaustedError` rather
 * than spinning — a refresh that is not fixing the 401 would otherwise loop forever.
 */

/** How a response status maps onto the auth decision. */
export type AuthOutcome = 'authorized' | 'refresh-required' | 'forbidden';

/**
 * Classify an HTTP status for auth purposes. ONLY 401 refreshes; 403 is a
 * permission error that must surface; everything else (2xx, 4xx, 5xx) is not an
 * auth failure and passes through as `authorized` — the caller handles non-auth
 * errors on its own terms.
 */
export function classifyAuthStatus(status: number): AuthOutcome {
	if (status === 401) {
		return 'refresh-required';
	}
	if (status === 403) {
		return 'forbidden';
	}
	return 'authorized';
}

/** A 403 — a permission error, surfaced without ever refreshing (row 14). */
export class AuthForbiddenError extends Error {
	readonly status = 403;
	constructor(
		message = 'Request forbidden (403): a permission error, not a stale token — not refreshing'
	) {
		super(message);
		this.name = 'AuthForbiddenError';
	}
}

/** A 401 that persisted after the bounded refresh attempts — surfaced instead of looping. */
export class AuthRefreshExhaustedError extends Error {
	readonly status = 401;
	constructor(
		message = 'Request still unauthorized (401) after refreshing — giving up rather than looping'
	) {
		super(message);
		this.name = 'AuthRefreshExhaustedError';
	}
}

/**
 * A single-flight token-refresh gate with a monotonic generation. Concurrent
 * `refresh()` callers share ONE underlying refresh (row 16); the generation
 * increments once per SUCCESSFUL refresh, letting a lane detect that another lane
 * already refreshed since its request began (the staggered-stampede guard). The
 * in-flight slot clears once the refresh settles — success OR failure — so a later
 * call starts a fresh refresh rather than replaying a stale outcome.
 */
export type RefreshGate = {
	/** The number of successful refreshes so far — captured before an attempt to detect a peer refresh. */
	generation(): number;
	/** Refresh (single-flight), resolving to the generation produced by this refresh. */
	refresh(): Promise<number>;
};

export function createRefreshGate(refreshToken: () => Promise<void>): RefreshGate {
	let generation = 0;
	let inFlight: Promise<number> | null = null;
	return {
		generation: () => generation,
		refresh: () => {
			if (inFlight) {
				return inFlight;
			}
			const started = refreshToken()
				.then(() => {
					generation += 1;
					return generation;
				})
				.finally(() => {
					if (inFlight === started) {
						inFlight = null;
					}
				});
			inFlight = started;
			return started;
		},
	};
}

/** A request attempt: the raw result plus the HTTP status the session classifies. */
export type AuthAttempt<R> = { status: number; result: R };

export type AuthSession = {
	/**
	 * Run an authenticated request. `perform` executes the request (with whatever
	 * token the host currently holds) and returns its status + result. On a 401 the
	 * session refreshes (single-flight, shared across concurrent `run` calls; skipped
	 * when a peer lane already refreshed since this attempt began) and retries, up to
	 * `maxRefreshAttempts`; on a 403 it throws `AuthForbiddenError` without refreshing;
	 * otherwise it returns the attempt.
	 */
	run<R>(perform: () => Promise<AuthAttempt<R>>): Promise<AuthAttempt<R>>;
};

/**
 * Create an auth session sharing one refresh gate across every request it runs —
 * so both a concurrent 401 stampede and a staggered stale 401 coalesce to a single
 * token refresh.
 */
export function createAuthSession(input: {
	refreshToken: () => Promise<void>;
	/** Max refreshes THIS lane drives before a persistent 401 surfaces as `AuthRefreshExhaustedError`. Default 1. */
	maxRefreshAttempts?: number;
}): AuthSession {
	const maxRefreshAttempts = input.maxRefreshAttempts ?? 1;
	const gate = createRefreshGate(input.refreshToken);

	return {
		async run<R>(perform: () => Promise<AuthAttempt<R>>): Promise<AuthAttempt<R>> {
			// ONE budget for refresh EVENTS — whether this lane drove the refresh or
			// merely benefited from a peer's. A lane always gets to retry with the newest
			// token before giving up, but a refresh that already failed to clear the 401
			// is never re-driven per-lane: N staggered lanes converge on `AuthRefreshExhaustedError`
			// after the single shared refresh, instead of each starting its own.
			let refreshesConsumed = 0;
			for (;;) {
				const attemptGeneration = gate.generation();
				const attempt = await perform();
				const outcome = classifyAuthStatus(attempt.status);
				if (outcome === 'authorized') {
					return attempt;
				}
				if (outcome === 'forbidden') {
					throw new AuthForbiddenError();
				}
				// refresh-required (401).
				if (refreshesConsumed >= maxRefreshAttempts) {
					throw new AuthRefreshExhaustedError();
				}
				refreshesConsumed += 1;
				if (gate.generation() > attemptGeneration) {
					// A peer lane already refreshed AFTER this attempt began — retry with the
					// fresh token WITHOUT starting our own refresh (the staggered-stampede
					// guard), but still count it so a persistent 401 gives up promptly.
					continue;
				}
				await gate.refresh();
			}
		},
	};
}
