// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSchedulerFetcherRegistry } from './scheduler-fetcher-registry';
import type { FetchTask } from './replication-policy';
import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';

function task(overrides: Partial<FetchTask> = {}): FetchTask {
  return {
    id: 'orders:ids:1:on-demand:woo-order:1',
    requirementId: 'orders.lookup.1',
    collection: 'orders',
    queryKey: 'orders:ids:1',
    ids: ['woo-order:1'],
    limit: 1,
    priority: 900,
    mode: 'on-demand',
    ...overrides,
  };
}

function state(overrides: Partial<PersistedSchedulerTaskState> = {}): PersistedSchedulerTaskState {
  return {
    taskId: 'orders:ids:1:on-demand:woo-order:1',
    requirementId: 'orders.lookup.1',
    collection: 'orders',
    queryKey: 'orders:ids:1',
    ids: ['woo-order:1'],
    limit: 1,
    priority: 900,
    mode: 'on-demand',
    status: 'queued',
    ownerId: null,
    claimedUntilMs: null,
    attempt: 0,
    retryAfterMs: null,
    updatedAtMs: 10_000,
    ...overrides,
  };
}

describe('createSchedulerFetcherRegistry', () => {
  it('dispatches supported tasks to their registered fetcher and rejects unsupported tasks before they are claimed', async () => {
    const ordersFetcher = vi.fn(async (fetchTask: FetchTask) => ({
      taskId: fetchTask.id,
      documentCount: fetchTask.ids?.length ?? fetchTask.limit,
      requestCount: 1,
      completed: true,
    }));
    const registry = createSchedulerFetcherRegistry([{
      name: 'orders',
      supportsTask: (candidate) => candidate.collection === 'orders' && candidate.queryKey.startsWith('orders:ids:'),
      fetcher: ordersFetcher,
    }]);
    const abortController = new AbortController();

    await expect(registry.fetcher(task(), { signal: abortController.signal })).resolves.toEqual({
      taskId: 'orders:ids:1:on-demand:woo-order:1',
      documentCount: 1,
      requestCount: 1,
      completed: true,
    });
    expect(ordersFetcher).toHaveBeenCalledWith(task(), { signal: abortController.signal });
    expect(registry.supportsTask(task({ collection: 'products', queryKey: 'products:search=tea:limit=10', ids: undefined }))).toBe(false);
    await expect(registry.fetcher(task({ collection: 'products', queryKey: 'products:search=tea:limit=10', ids: undefined }))).rejects.toThrow('No scheduler fetcher registered for products task products:search=tea:limit=10');
  });

  it('wraps persisted scheduler repositories so unsupported collection states stay queued instead of failing at fetch time', async () => {
    const supportedOrder = state();
    const unsupportedProduct = state({ taskId: 'products:search:tea', requirementId: 'products.search.tea', collection: 'products', queryKey: 'products:search=tea:limit=10', ids: undefined, limit: 10, priority: 700, mode: 'windowed' });
    const repository = {
      readRunnable: vi.fn(async () => [unsupportedProduct, supportedOrder]),
      claim: vi.fn(async () => true),
      completeOrRequeue: vi.fn(async () => 'completed' as const),
      markFailed: vi.fn(async () => true),
    };
    const registry = createSchedulerFetcherRegistry([{
      name: 'orders',
      supportsTask: (candidate) => candidate.collection === 'orders',
      fetcher: vi.fn(),
    }]);

    const wrappedRepository = registry.supportedRepository(repository);

    await expect(wrappedRepository.readRunnable(12_000)).resolves.toEqual([supportedOrder]);
    expect(repository.readRunnable).toHaveBeenCalledWith(12_000);
    await wrappedRepository.claim(supportedOrder, supportedOrder);
    await wrappedRepository.completeOrRequeue(supportedOrder, supportedOrder, supportedOrder);
    await wrappedRepository.markFailed(supportedOrder, supportedOrder);
    expect(repository.claim).toHaveBeenCalledWith(supportedOrder, supportedOrder);
    expect(repository.completeOrRequeue).toHaveBeenCalledWith(supportedOrder, supportedOrder, supportedOrder);
    expect(repository.markFailed).toHaveBeenCalledWith(supportedOrder, supportedOrder);
  });
});
