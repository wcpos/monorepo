import { describe, expect, it } from 'vitest';
import { computeRetryBackoffMs, retryJitterSeed, DEFAULT_RETRY_BACKOFF, type RetryBackoffPolicy } from './recordRetryBackoff';

const NO_JITTER: RetryBackoffPolicy = { baseMs: 1_000, multiplier: 2, maxMs: 60_000, jitterRatio: 0 };

describe('computeRetryBackoffMs', () => {
  it('is exponential in the number of prior failures', () => {
    expect(computeRetryBackoffMs(1, NO_JITTER)).toBe(1_000);
    expect(computeRetryBackoffMs(2, NO_JITTER)).toBe(2_000);
    expect(computeRetryBackoffMs(3, NO_JITTER)).toBe(4_000);
    expect(computeRetryBackoffMs(4, NO_JITTER)).toBe(8_000);
  });

  it('treats attempts ≤ 1 (incl. 0) as the base delay', () => {
    expect(computeRetryBackoffMs(0, NO_JITTER)).toBe(1_000);
    expect(computeRetryBackoffMs(1, NO_JITTER)).toBe(1_000);
  });

  it('caps the delay at maxMs (keeps retrying at the ceiling — no hard attempt cap)', () => {
    expect(computeRetryBackoffMs(20, NO_JITTER)).toBe(60_000);
    expect(computeRetryBackoffMs(1_000, NO_JITTER)).toBe(60_000);
  });

  it('applies deterministic jitter within ±ratio/2 of the curve', () => {
    const policy: RetryBackoffPolicy = { ...NO_JITTER, jitterRatio: 0.2 };
    // seed 500 ⇒ fraction 0 ⇒ exactly the curve value
    expect(computeRetryBackoffMs(2, policy, 500)).toBe(2_000);
    // seed 0 ⇒ fraction -0.5 ⇒ -10%
    expect(computeRetryBackoffMs(2, policy, 0)).toBe(1_800);
    // every seed stays inside [0.9x, 1.1x]
    for (let seed = 0; seed < 1_000; seed += 1) {
      const delay = computeRetryBackoffMs(3, policy, seed);
      expect(delay).toBeGreaterThanOrEqual(3_600);
      expect(delay).toBeLessThanOrEqual(4_400);
    }
  });

  it('is deterministic — same inputs, same output', () => {
    expect(computeRetryBackoffMs(3, DEFAULT_RETRY_BACKOFF, 42)).toBe(computeRetryBackoffMs(3, DEFAULT_RETRY_BACKOFF, 42));
  });

  it('never returns a negative delay', () => {
    expect(computeRetryBackoffMs(1, { baseMs: 1, multiplier: 2, maxMs: 10, jitterRatio: 1 }, 0)).toBeGreaterThanOrEqual(0);
  });

  it('treats a non-finite jitter ratio as no jitter (never NaN)', () => {
    expect(computeRetryBackoffMs(2, { ...NO_JITTER, jitterRatio: Number.NaN }, 7)).toBe(2_000);
    expect(computeRetryBackoffMs(2, { ...NO_JITTER, jitterRatio: Number.POSITIVE_INFINITY }, 7)).toBe(2_000);
  });

  it('omitting jitterSeed yields the bare curve (no jitter), even with a jitter ratio', () => {
    const policy: RetryBackoffPolicy = { ...NO_JITTER, jitterRatio: 0.2 };
    expect(computeRetryBackoffMs(2, policy)).toBe(2_000); // omit ⇒ no jitter
    expect(computeRetryBackoffMs(2, policy, 0)).toBe(1_800); // an explicit seed (even 0) DOES jitter
  });
});

describe('retryJitterSeed', () => {
  it('is deterministic and a non-negative integer below 1e6', () => {
    const seed = retryJitterSeed('mutation:order:update:abc-123');
    expect(seed).toBe(retryJitterSeed('mutation:order:update:abc-123'));
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1_000_000);
  });

  it('spreads different mutationIds across distinct seeds', () => {
    const a = retryJitterSeed('mutation:order:update:aaa');
    const b = retryJitterSeed('mutation:order:update:bbb');
    expect(a).not.toBe(b);
  });
});
