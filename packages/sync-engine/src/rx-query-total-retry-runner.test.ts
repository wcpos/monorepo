// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runQueryTotalRetryRequests, type QueryTotalRetryRunnerCacheRepository, type QueryTotalRetryRunnerStateRepository } from './rx-query-total-retry-runner';
import type { QueryTotalRequestState } from './scheduler/query-total-request-lifecycle';
import type { QueryTotalWooRequest } from './scheduler/query-total-requests';

const request: QueryTotalWooRequest = {
  queryKey: 'orders:browser:status=processing:limit=50',
  method: 'GET',
  endpoint: '/wp-json/wc/v3/orders',
  params: { status: 'processing', page: 1, per_page: 1 },
  totalHeader: 'X-WP-Total',
};

function state(overrides: Partial<QueryTotalRequestState> = {}): QueryTotalRequestState {
  return {
    queryKey: request.queryKey,
    status: 'failed',
    ownerId: null,
    claimedUntilMs: null,
    attempt: 1,
    retryAfterMs: 900,
    updatedAtMs: 800,
    request,
    ...overrides,
  };
}

function createStateRepository(runnable: QueryTotalRequestState[], claimResult = true): QueryTotalRetryRunnerStateRepository {
  return {
    readRunnable: vi.fn(async () => runnable),
    claim: vi.fn(async () => claimResult),
    remove: vi.fn(async () => true),
    markFailed: vi.fn(async () => true),
  };
}

function createCacheRepository(): QueryTotalRetryRunnerCacheRepository {
  return {
    readFresh: vi.fn(async () => []),
    upsert: vi.fn(async () => undefined),
  };
}

const baseInput = {
  ownerId: 'tab-retry',
  nowMs: 1_000,
  leaseForMs: 300,
  retryAfterMs: 500,
  freshForMs: 2_000,
};

describe('runQueryTotalRetryRequests', () => {
  it('skips runnable rows that do not have persisted Woo request metadata', async () => {
    const stateRepository = createStateRepository([state({ request: null })]);
    const cacheRepository = createCacheRepository();
    const fetchWooQueryTotal = vi.fn(async () => 42);

    const result = await runQueryTotalRetryRequests({
      ...baseInput,
      stateRepository,
      cacheRepository,
      fetchWooQueryTotal,
    });

    expect(result.skippedMissingRequest).toBe(1);
    expect(stateRepository.claim).not.toHaveBeenCalled();
    expect(fetchWooQueryTotal).not.toHaveBeenCalled();
    expect(cacheRepository.upsert).not.toHaveBeenCalled();
  });

  it('claims runnable work, fetches the persisted Woo request, caches the total, and removes the claimed state', async () => {
    const runnable = state();
    const stateRepository = createStateRepository([runnable]);
    const cacheRepository = createCacheRepository();
    const fetchWooQueryTotal = vi.fn(async () => 37);

    const result = await runQueryTotalRetryRequests({
      ...baseInput,
      stateRepository,
      cacheRepository,
      fetchWooQueryTotal,
    });

    const claimedState = state({
      status: 'in-flight',
      ownerId: 'tab-retry',
      claimedUntilMs: 1_300,
      attempt: 2,
      retryAfterMs: null,
      updatedAtMs: 1_000,
    });
    expect(stateRepository.claim).toHaveBeenCalledWith(runnable, claimedState);
    expect(fetchWooQueryTotal).toHaveBeenCalledWith({ request });
    expect(cacheRepository.upsert).toHaveBeenCalledWith({
      queryKey: request.queryKey,
      totalMatchingRecords: 37,
      freshUntilMs: 3_000,
      updatedAtMs: 1_000,
    });
    expect(stateRepository.remove).toHaveBeenCalledWith(claimedState);
    expect(result.succeeded).toBe(1);
    expect(result.cacheEntries).toEqual([{
      queryKey: request.queryKey,
      totalMatchingRecords: 37,
      freshUntilMs: 3_000,
      updatedAtMs: 1_000,
    }]);
  });

  it('passes the engine tick cancellation signal to the Woo total request', async () => {
    const stateRepository = createStateRepository([state()]);
    const cacheRepository = createCacheRepository();
    const controller = new AbortController();
    const fetchWooQueryTotal = vi.fn(async (input: { signal?: AbortSignal }) => {
      expect(input.signal).toBe(controller.signal);
      return 37;
    });

    const result = await runQueryTotalRetryRequests({
      ...baseInput,
      stateRepository,
      cacheRepository,
      fetchWooQueryTotal,
      signal: controller.signal,
    });

    expect(fetchWooQueryTotal).toHaveBeenCalledWith({ request, signal: controller.signal });
    expect(result.succeeded).toBe(1);
  });

  it('does not fetch when guarded claim loses to a newer owner', async () => {
    const stateRepository = createStateRepository([state()], false);
    const cacheRepository = createCacheRepository();
    const fetchWooQueryTotal = vi.fn(async () => 37);

    const result = await runQueryTotalRetryRequests({
      ...baseInput,
      stateRepository,
      cacheRepository,
      fetchWooQueryTotal,
    });

    expect(result.claimLost).toBe(1);
    expect(fetchWooQueryTotal).not.toHaveBeenCalled();
    expect(cacheRepository.upsert).not.toHaveBeenCalled();
    expect(stateRepository.remove).not.toHaveBeenCalled();
  });

  it('uses fresh cache evidence before claiming runnable state', async () => {
    const runnable = state();
    const stateRepository = createStateRepository([runnable]);
    const cacheRepository = createCacheRepository();
    vi.mocked(cacheRepository.readFresh).mockResolvedValueOnce([{
      queryKey: request.queryKey,
      totalMatchingRecords: 41,
      freshUntilMs: 3_000,
      updatedAtMs: 950,
    }]);
    const fetchWooQueryTotal = vi.fn(async () => 37);

    const result = await runQueryTotalRetryRequests({
      ...baseInput,
      stateRepository,
      cacheRepository,
      fetchWooQueryTotal,
    });

    expect(stateRepository.claim).not.toHaveBeenCalled();
    expect(fetchWooQueryTotal).not.toHaveBeenCalled();
    expect(stateRepository.remove).toHaveBeenCalledWith(runnable);
    expect(result.skippedFreshCache).toBe(1);
    expect(result.cacheEntries).toEqual([{
      queryKey: request.queryKey,
      totalMatchingRecords: 41,
      freshUntilMs: 3_000,
      updatedAtMs: 950,
    }]);
  });

  it('marks the claimed state failed with retry backoff when Woo total fetch fails', async () => {
    const runnable = state({ status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: 900, retryAfterMs: null });
    const stateRepository = createStateRepository([runnable]);
    const cacheRepository = createCacheRepository();
    const getNowMs = vi.fn(() => 1_700);
    const fetchWooQueryTotal = vi.fn(async () => {
      throw new Error('total unavailable');
    });

    const result = await runQueryTotalRetryRequests({
      ...baseInput,
      stateRepository,
      cacheRepository,
      getNowMs,
      fetchWooQueryTotal,
    });

    const claimedState = state({
      status: 'in-flight',
      ownerId: 'tab-retry',
      claimedUntilMs: 1_300,
      attempt: 2,
      retryAfterMs: null,
      updatedAtMs: 1_000,
    });
    expect(stateRepository.markFailed).toHaveBeenCalledWith(claimedState, {
      ...claimedState,
      status: 'failed',
      ownerId: null,
      claimedUntilMs: null,
      retryAfterMs: 2_200,
      updatedAtMs: 1_700,
    });
    expect(cacheRepository.upsert).not.toHaveBeenCalled();
    expect(stateRepository.remove).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });
});
