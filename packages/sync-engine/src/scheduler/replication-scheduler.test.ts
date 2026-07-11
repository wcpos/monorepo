// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { planSchedulerTasks, runSchedulerScenario } from './replication-scheduler';
import type { ReplicationRequirement } from './replication-policy';

function requirement(overrides: Partial<ReplicationRequirement> & Pick<ReplicationRequirement, 'id' | 'collection'>): ReplicationRequirement {
  return {
    id: overrides.id,
    collection: overrides.collection,
    kind: overrides.kind ?? 'query',
    queryKey: overrides.queryKey ?? overrides.id,
    ids: overrides.ids,
    wooIds: overrides.wooIds,
    policy: {
      mode: overrides.policy?.mode ?? 'on-demand',
      priority: overrides.policy?.priority ?? 100,
      batchSize: overrides.policy?.batchSize ?? 10,
      maxRequests: overrides.policy?.maxRequests,
      pollingIntervalMs: overrides.policy?.pollingIntervalMs,
      staleAfterMs: overrides.policy?.staleAfterMs,
      offline: overrides.policy?.offline ?? { read: 'serve-local', write: 'queue' },
    },
  };
}

describe('planSchedulerTasks', () => {
  it('derives ordered remote tasks without invoking a fetcher', () => {
    const result = planSchedulerTasks({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'products.background', collection: 'products', kind: 'lane', queryKey: 'products:background', policy: { mode: 'windowed', priority: 100, batchSize: 25, offline: { read: 'serve-local', write: 'queue' } } }),
        requirement({ id: 'orders.deep-link.123', collection: 'orders', kind: 'targeted-records', queryKey: 'orders:ids:123', ids: ['woo-order:123'], policy: { mode: 'on-demand', priority: 1000, batchSize: 1, offline: { read: 'fail-if-missing', write: 'queue' } } }),
      ],
    });

    expect(result.tasks.map((task) => task.requirementId)).toEqual(['orders.deep-link.123', 'products.background']);
    expect(result.skipped).toEqual([]);
  });

  it('carries the requirement wooIds numeric channel through onto the fetch task', () => {
    const result = planSchedulerTasks({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'orders.deep-link.123', collection: 'orders', kind: 'targeted-records', queryKey: 'orders:ids:123', ids: ['woo-order:123'], wooIds: [123], policy: { mode: 'on-demand', priority: 1000, batchSize: 1, offline: { read: 'fail-if-missing', write: 'queue' } } }),
      ],
    });

    expect(result.tasks[0].wooIds).toEqual([123]);
  });

  it('reports offline skips without remote tasks', () => {
    const result = planSchedulerTasks({
      connectivity: 'offline',
      requirements: [
        requirement({ id: 'products.initial', collection: 'products', kind: 'query', queryKey: 'products:initial', policy: { mode: 'windowed', priority: 300, batchSize: 10, offline: { read: 'serve-local', write: 'queue' } } }),
      ],
    });

    expect(result.tasks).toEqual([]);
    expect(result.skipped).toEqual([{ requirementId: 'products.initial', reason: 'offline: served local data only' }]);
  });
});

describe('runSchedulerScenario', () => {
  it('runs higher-priority targeted requirements before lower-priority background work', async () => {
    const fetcher = vi.fn(async (task) => ({
      taskId: task.id,
      documentCount: task.limit,
      requestCount: 1,
      completed: true,
    }));

    const result = await runSchedulerScenario({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'products.background', collection: 'products', kind: 'lane', queryKey: 'products:background', policy: { mode: 'windowed', priority: 100, batchSize: 25, offline: { read: 'serve-local', write: 'queue' } } }),
        requirement({ id: 'orders.deep-link.123', collection: 'orders', kind: 'targeted-records', queryKey: 'orders:ids:123', ids: ['woo-order:123'], policy: { mode: 'on-demand', priority: 1000, batchSize: 1, offline: { read: 'fail-if-missing', write: 'queue' } } }),
      ],
      fetcher,
    });

    expect(result.tasks.map((task) => task.requirementId)).toEqual(['orders.deep-link.123', 'products.background']);
    expect(fetcher.mock.calls.map(([task]) => task.requirementId)).toEqual(['orders.deep-link.123', 'products.background']);
  });

  it('coalesces identical requirements into one remote fetch task', async () => {
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: 1, requestCount: 1, completed: true }));

    const result = await runSchedulerScenario({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'cart.product.123', collection: 'products', kind: 'targeted-records', queryKey: 'products:ids:123', ids: ['product:123'], policy: { mode: 'on-demand', priority: 800, batchSize: 1, offline: { read: 'serve-local', write: 'queue' } } }),
        requirement({ id: 'related.product.123', collection: 'products', kind: 'targeted-records', queryKey: 'products:ids:123', ids: ['product:123'], policy: { mode: 'on-demand', priority: 700, batchSize: 1, offline: { read: 'serve-local', write: 'queue' } } }),
      ],
      fetcher,
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].requirementId).toBe('cart.product.123');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not coalesce targeted requirements with different record ids under the same query key', async () => {
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: task.ids?.length ?? 0, requestCount: 1, completed: true }));

    const result = await runSchedulerScenario({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'cart.product.123', collection: 'products', kind: 'targeted-records', queryKey: 'products:ids', ids: ['product:123'], policy: { mode: 'on-demand', priority: 800, batchSize: 1, offline: { read: 'serve-local', write: 'queue' } } }),
        requirement({ id: 'cart.product.456', collection: 'products', kind: 'targeted-records', queryKey: 'products:ids', ids: ['product:456'], policy: { mode: 'on-demand', priority: 700, batchSize: 1, offline: { read: 'serve-local', write: 'queue' } } }),
      ],
      fetcher,
    });

    expect(result.tasks.map((task) => task.requirementId)).toEqual(['cart.product.123', 'cart.product.456']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('continues remote scheduling while connectivity is degraded', async () => {
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: 1, requestCount: 1, completed: true }));

    const result = await runSchedulerScenario({
      connectivity: 'degraded',
      requirements: [
        requirement({ id: 'products.initial', collection: 'products', kind: 'query', queryKey: 'products:initial', policy: { mode: 'windowed', priority: 300, batchSize: 10, offline: { read: 'serve-local', write: 'queue' } } }),
      ],
      fetcher,
    });

    expect(result.skipped).toEqual([]);
    expect(result.tasks).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves local-only requirements while offline and does not fetch remotely', async () => {
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: 1, requestCount: 1, completed: true }));

    const result = await runSchedulerScenario({
      connectivity: 'offline',
      requirements: [
        requirement({ id: 'products.initial', collection: 'products', kind: 'query', queryKey: 'products:initial', policy: { mode: 'windowed', priority: 300, batchSize: 10, offline: { read: 'serve-local', write: 'queue' } } }),
        requirement({ id: 'orders.deep-link.456', collection: 'orders', kind: 'targeted-records', queryKey: 'orders:ids:456', ids: ['woo-order:456'], policy: { mode: 'on-demand', priority: 1000, batchSize: 1, offline: { read: 'fail-if-missing', write: 'queue' } } }),
      ],
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.tasks).toHaveLength(0);
    expect(result.skipped).toEqual([
      { requirementId: 'products.initial', reason: 'offline: served local data only' },
      { requirementId: 'orders.deep-link.456', reason: 'offline: required remote data is unavailable' },
    ]);
  });

  it('continues a greedy lane until the fetcher reports completion', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ taskId: 'taxRates:taxRates:all:greedy', documentCount: 5, requestCount: 1, completed: false })
      .mockResolvedValueOnce({ taskId: 'taxRates:taxRates:all:greedy', documentCount: 3, requestCount: 1, completed: true });

    const result = await runSchedulerScenario({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'taxRates.all', collection: 'taxRates', kind: 'lane', queryKey: 'taxRates:all', policy: { mode: 'greedy', priority: 1000, batchSize: 10, offline: { read: 'fail-if-missing', write: 'reject' } } }),
      ],
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.totalDocuments).toBe(8);
    expect(result.totalRequests).toBe(2);
    expect(result.results.map((item) => item.completed)).toEqual([false, true]);
  });

  it('passes the caller abort signal to scheduler fetchers', async () => {
    const abortController = new AbortController();
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: task.limit, requestCount: 1, completed: true }));

    await runSchedulerScenario({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'products.search.keyboard', collection: 'products', queryKey: 'products:search:keyboard' }),
      ],
      fetcher,
      signal: abortController.signal,
    });

    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ requirementId: 'products.search.keyboard' }), {
      signal: abortController.signal,
    });
  });

  it('stops before starting the next task when the caller aborts the scheduler run', async () => {
    const abortController = new AbortController();
    const fetcher = vi.fn(async (task) => {
      abortController.abort(new Error('scheduler abandoned'));
      return { taskId: task.id, documentCount: task.limit, requestCount: 1, completed: true };
    });

    await expect(runSchedulerScenario({
      connectivity: 'online',
      requirements: [
        requirement({ id: 'products.search.keyboard', collection: 'products', queryKey: 'products:search:keyboard', policy: { mode: 'on-demand', priority: 900, batchSize: 10, offline: { read: 'serve-local', write: 'queue' } } }),
        requirement({ id: 'products.background', collection: 'products', queryKey: 'products:background', policy: { mode: 'windowed', priority: 100, batchSize: 25, offline: { read: 'serve-local', write: 'queue' } } }),
      ],
      fetcher,
      signal: abortController.signal,
    })).rejects.toThrow('scheduler abandoned');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toEqual(expect.objectContaining({ requirementId: 'products.search.keyboard' }));
  });

});
