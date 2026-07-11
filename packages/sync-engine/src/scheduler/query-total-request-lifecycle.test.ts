// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { planQueryTotalRequestLifecycle, type QueryTotalRequestLifecycleInput, type QueryTotalRequestState } from './query-total-request-lifecycle';
import type { QueryTotalCacheEntry } from './query-total-requests';
import type { QueryTotalDiscoveryDecision } from './query-total-discovery';

const needsTotalDecision: QueryTotalDiscoveryDecision = {
  queryKey: 'orders:browser:status=processing:search=:limit=50',
  action: 'request-query-total',
  reason: 'filtered exact-limit query needs a query-specific Woo total before expected ids are trusted',
  complete: false,
  shouldRequestQueryTotal: true,
  totalMatchingRecords: null,
};

const completeDecision: QueryTotalDiscoveryDecision = {
  queryKey: 'orders:browser:status=processing:search=hat:limit=50',
  action: 'record-complete-lane',
  reason: 'known matching total equals returned records',
  complete: true,
  shouldRequestQueryTotal: false,
  totalMatchingRecords: 12,
};

const baseInput: QueryTotalRequestLifecycleInput = {
  discovery: needsTotalDecision,
  connectivity: 'online',
  nowMs: 1_500,
  ownerId: 'tab-a',
  endpoint: '/wp-json/wc/v3/orders',
  filters: { status: 'processing' },
  cacheEntries: [],
  requestStates: [],
};

function cacheEntry(overrides: Partial<QueryTotalCacheEntry> = {}): QueryTotalCacheEntry {
  return {
    queryKey: needsTotalDecision.queryKey,
    totalMatchingRecords: 42,
    freshUntilMs: 2_000,
    updatedAtMs: 1_000,
    ...overrides,
  };
}

function state(overrides: Partial<QueryTotalRequestState> = {}): QueryTotalRequestState {
  return {
    queryKey: needsTotalDecision.queryKey,
    status: 'in-flight',
    ownerId: 'tab-b',
    claimedUntilMs: 2_000,
    attempt: 1,
    retryAfterMs: null,
    updatedAtMs: 1_000,
    request: null,
    ...overrides,
  };
}

describe('planQueryTotalRequestLifecycle', () => {
  it('skips requests when discovery does not require a query-specific total', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      discovery: completeDecision,
    });

    expect(result.action).toBe('skip-not-needed');
    expect(result.ownerStatus).toBe('not-needed');
    expect(result.retryStatus).toBe('not-needed');
    expect(result.request).toBeNull();
  });

  it('uses a fresh cached query total before considering ownership state', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      cacheEntries: [cacheEntry()],
      requestStates: [state({ status: 'in-flight', claimedUntilMs: 2_000 })],
    });

    expect(result.action).toBe('use-cached-total');
    expect(result.totalMatchingRecords).toBe(42);
    expect(result.ownerStatus).toBe('cache-hit');
    expect(result.request).toBeNull();
  });

  it('waits for an active owner lease for the same query key', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      requestStates: [state({ status: 'in-flight', ownerId: 'tab-b', claimedUntilMs: 2_000 })],
    });

    expect(result.action).toBe('wait-for-owner');
    expect(result.ownerStatus).toBe('owned-by-other-tab');
    expect(result.retryStatus).toBe('not-applicable');
    expect(result.request).toBeNull();
  });

  it('waits when the current tab already owns an active lease', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      requestStates: [state({ status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: baseInput.nowMs + 1_000 })],
    });

    expect(result.action).toBe('wait-for-owner');
    expect(result.ownerStatus).toBe('owned-by-current-tab');
    expect(result.retryStatus).toBe('not-applicable');
    expect(result.request).toBeNull();
  });

  it('takes over an expired owner lease for the same query key', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      requestStates: [state({ status: 'in-flight', ownerId: 'tab-b', claimedUntilMs: 1_400 })],
    });

    expect(result.action).toBe('take-over-request');
    expect(result.ownerStatus).toBe('expired-owner');
    expect(result.retryStatus).toBe('not-applicable');
    expect(result.nextAttempt).toBe(2);
    expect(result.request?.params).toEqual({ status: 'processing', page: 1, per_page: 1 });
  });

  it('waits for retry backoff before reclaiming a failed request', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      requestStates: [state({ status: 'failed', ownerId: null, claimedUntilMs: null, attempt: 2, retryAfterMs: 1_800 })],
    });

    expect(result.action).toBe('wait-for-retry');
    expect(result.ownerStatus).toBe('unowned');
    expect(result.retryStatus).toBe('backoff-active');
    expect(result.request).toBeNull();
  });

  it('claims a failed request after retry backoff expires', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      requestStates: [state({ status: 'failed', ownerId: null, claimedUntilMs: null, attempt: 2, retryAfterMs: 1_400 })],
    });

    expect(result.action).toBe('claim-request');
    expect(result.ownerStatus).toBe('unowned');
    expect(result.retryStatus).toBe('retry-ready');
    expect(result.nextAttempt).toBe(3);
    expect(result.request?.queryKey).toBe(needsTotalDecision.queryKey);
  });

  it('skips remote lifecycle claims while offline', () => {
    const result = planQueryTotalRequestLifecycle({
      ...baseInput,
      connectivity: 'offline',
    });

    expect(result.action).toBe('skip-offline');
    expect(result.ownerStatus).toBe('not-claimed');
    expect(result.request).toBeNull();
  });

  it('claims a new query-total request when online without cache or active durable state', () => {
    const result = planQueryTotalRequestLifecycle(baseInput);

    expect(result.action).toBe('claim-request');
    expect(result.ownerStatus).toBe('unowned');
    expect(result.retryStatus).toBe('not-applicable');
    expect(result.nextAttempt).toBe(1);
    expect(result.request?.method).toBe('GET');
  });
});
