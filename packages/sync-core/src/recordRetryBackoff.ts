/**
 * The minimal in-engine retry backoff for the record* write path (ADR 0012).
 *
 * This is the deliberately-small replacement for the deleted heavyweight retry-scheduling
 * design gallery (#261): a pure exponential-backoff-with-cap policy, plus deterministic
 * jitter so that when many terminals reconnect after a server blip they do not all re-push
 * on the same tick. No durable retry-schedule collection, no reconciliation, no ownership —
 * the drain reads `nextAttemptAt` off the queued mutation and reschedules on failure.
 */

export type RetryBackoffPolicy = {
	/** Delay before the first retry (after one failure), in ms. */
	baseMs: number;
	/** Exponential factor applied per prior failure. */
	multiplier: number;
	/** Hard cap on the delay, in ms — a sale must still land, so we keep retrying at this ceiling. */
	maxMs: number;
	/** Fraction of the delay to spread as deterministic jitter (0 = none). e.g. 0.2 ⇒ ±10%. */
	jitterRatio?: number;
};

/** 1s → 2s → 4s … capped at 60s, ±10% jitter. Conservative; no hard attempt cap (writes must land). */
export const DEFAULT_RETRY_BACKOFF: RetryBackoffPolicy = {
	baseMs: 1_000,
	multiplier: 2,
	maxMs: 60_000,
	jitterRatio: 0.2,
};

/**
 * The delay (ms) to wait before the next push attempt.
 *
 * @param attempts  How many push attempts have already FAILED for this mutation (≥ 1 once it
 *                  has failed once). attempts ≤ 1 uses `baseMs`; each further failure multiplies.
 * @param policy    The backoff curve.
 * @param jitterSeed A non-negative integer (the drain derives it from `mutationId`) — makes the
 *                  jitter deterministic and per-mutation, so it is pure and unit-testable while
 *                  still spreading retries across mutations/terminals. Omit ⇒ no jitter offset.
 */
export function computeRetryBackoffMs(
	attempts: number,
	policy: RetryBackoffPolicy,
	jitterSeed?: number
): number {
	const priorFailures = Math.max(0, Math.floor(attempts) - 1);
	const exponential = policy.baseMs * Math.pow(policy.multiplier, priorFailures);
	const capped = Math.min(policy.maxMs, exponential);

	const ratio = policy.jitterRatio ?? 0;
	if (jitterSeed === undefined || !Number.isFinite(ratio) || ratio <= 0) {
		// No seed (or no/invalid ratio) ⇒ the bare exponential-capped delay. Omitting the seed means
		// no jitter; the non-finite guard keeps a misconfigured ratio from producing a NaN delay.
		return Math.max(0, Math.round(capped));
	}
	// Deterministic offset in [-ratio/2, +ratio/2) derived from the seed — no Math.random, so the
	// delay is reproducible in tests and identical across a mutation's retries (stable, not drifting).
	const fraction = (Math.abs(Math.floor(jitterSeed)) % 1000) / 1000 - 0.5;
	return Math.max(0, Math.round(capped * (1 + ratio * fraction)));
}

/** Stable non-negative integer seed from a mutationId, for `computeRetryBackoffMs` jitter. */
export function retryJitterSeed(mutationId: string): number {
	let hash = 0;
	for (let index = 0; index < mutationId.length; index += 1) {
		hash = (hash * 31 + mutationId.charCodeAt(index)) % 1_000_000;
	}
	return hash;
}
