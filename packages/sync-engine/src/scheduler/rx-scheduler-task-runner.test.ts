// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { runPersistedSchedulerTasks, type PersistedSchedulerTaskRunnerRepository } from './rx-scheduler-task-runner';
import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';

function state(overrides: Partial<PersistedSchedulerTaskState> = {}): PersistedSchedulerTaskState {
  return {
    taskId: 'orders:orders:open:windowed',
    requirementId: 'orders.open',
    collection: 'orders',
    queryKey: 'orders:open',
    limit: 25,
    priority: 600,
    mode: 'windowed',
    status: 'failed',
    ownerId: null,
    claimedUntilMs: null,
    attempt: 1,
    retryAfterMs: 900,
    updatedAtMs: 800,
    ...overrides,
  };
}

function createRepository(
  runnable: PersistedSchedulerTaskState[],
  claimResult: boolean | boolean[] = true,
  completeResult = true,
  failResult = true,
): PersistedSchedulerTaskRunnerRepository {
  const claimResults = Array.isArray(claimResult) ? [...claimResult] : null;
  const steadyClaimResult = typeof claimResult === 'boolean' ? claimResult : true;
  return {
    readRunnable: vi.fn(async () => runnable),
    claim: vi.fn(async () => claimResults?.shift() ?? steadyClaimResult),
    // Preserve the old boolean contract: true → a normal completion, false → claim-lost.
    completeOrRequeue: vi.fn(async () => (completeResult ? 'completed' : 'claim-lost')),
    markFailed: vi.fn(async () => failResult),
  };
}

function createThrowingCompletionRepository(runnable: PersistedSchedulerTaskState[]): PersistedSchedulerTaskRunnerRepository {
  return {
    ...createRepository(runnable),
    completeOrRequeue: vi.fn(async () => {
      throw new Error('completion write failed');
    }),
  };
}

const baseInput = {
  ownerId: 'tab-runner',
  nowMs: 1_000,
  leaseForMs: 300,
  retryAfterMs: 500,
};

describe('runPersistedSchedulerTasks', () => {
  it('claims runnable scheduler state, fetches it, and marks the claimed state completed', async () => {
    const runnable = state();
    const repository = createRepository([runnable]);
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
    });

    const claimedState = state({
      status: 'in-flight',
      ownerId: 'tab-runner',
      claimedUntilMs: 1_300,
      attempt: 2,
      retryAfterMs: null,
      updatedAtMs: 1_000,
    });
    const completedState = state({
      ...claimedState,
      status: 'completed',
      ownerId: null,
      claimedUntilMs: null,
      updatedAtMs: 1_000,
    });
    expect(repository.claim).toHaveBeenCalledWith(runnable, claimedState);
    expect(fetcher).toHaveBeenCalledWith({
      id: runnable.taskId,
      requirementId: runnable.requirementId,
      collection: runnable.collection,
      queryKey: runnable.queryKey,
      ids: runnable.ids,
      limit: runnable.limit,
      priority: runnable.priority,
      mode: runnable.mode,
    });
    expect(repository.completeOrRequeue).toHaveBeenCalledWith(
      claimedState,
      completedState,
      expect.objectContaining({ status: 'queued', attempt: 0 }),
    );
    expect(result).toEqual({
      scanned: 1,
      claimLost: 0,
      completionLost: 0,
      failureLost: 0,
      renewalLost: 0,
      succeeded: 1,
      coalescedReruns: 0,
      failed: 0,
      totalDocuments: 25,
      totalRequests: 1,
    });
  });

  it('does not fail a completed fetch when the progress observer throws', async () => {
    const runnable = state();
    const repository = createRepository([runnable]);
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));
    const onProgress = vi.fn(() => {
      throw new Error('observer failed');
    });

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith({ collection: runnable.collection, documents: 25, requests: 1 });
    expect(result.succeeded).toBe(1);
    expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('does not fetch when the guarded claim loses to a newer owner', async () => {
    const repository = createRepository([state()], false);
    const fetcher = vi.fn(async () => ({ taskId: 'orders:orders:open:windowed', documentCount: 25, requestCount: 1, completed: true }));

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
    });

    expect(result.claimLost).toBe(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(repository.completeOrRequeue).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('counts a coalesced re-run as a success when the completion re-queued instead of finishing (#318)', async () => {
    const runnable = state();
    const repository = createRepository([runnable]);
    // A change arrived mid-flight, so completeOrRequeue re-queued a fresh run.
    vi.mocked(repository.completeOrRequeue).mockResolvedValueOnce('requeued');
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));

    const result = await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

    expect(result.succeeded).toBe(1);
    expect(result.coalescedReruns).toBe(1);
    expect(result.completionLost).toBe(0);
  });

  it('does not report success when the guarded completion update loses to a newer owner', async () => {
    const runnable = state();
    const repository = createRepository([runnable], true, false);
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
    });

    expect(repository.completeOrRequeue).toHaveBeenCalled();
    expect(result.succeeded).toBe(0);
    expect(result.completionLost).toBe(1);
    expect(result.totalDocuments).toBe(25);
    expect(result.totalRequests).toBe(1);
  });

  it('surfaces completion persistence errors without marking successful fetches failed', async () => {
    const runnable = state();
    const repository = createThrowingCompletionRepository([runnable]);
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));

    await expect(runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
    })).rejects.toThrow('completion write failed');

    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('uses fresh time for each scheduler task claim', async () => {
    const first = state({ taskId: 'orders:first' });
    const second = state({ taskId: 'orders:second', requirementId: 'orders.second' });
    const repository = createRepository([first, second]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(5_000)
      .mockReturnValueOnce(5_100);
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: 1, requestCount: 1, completed: true }));

    await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
    });

    expect(repository.readRunnable).toHaveBeenCalledWith(900);
    expect(repository.claim).toHaveBeenNthCalledWith(1, first, expect.objectContaining({
      taskId: 'orders:first',
      claimedUntilMs: 1_300,
      updatedAtMs: 1_000,
    }));
    expect(repository.claim).toHaveBeenNthCalledWith(2, second, expect.objectContaining({
      taskId: 'orders:second',
      claimedUntilMs: 5_300,
      updatedAtMs: 5_000,
    }));
  });

  it('drains runnable tasks in PRIORITY order (highest first), regardless of repository order', async () => {
    // The POS cannot sell without tax rates; a low-priority order backlog lane
    // must never drain ahead of the greedy tax-rate lane (C3 / pain point #2).
    const backlog = state({ taskId: 'products:backfill', requirementId: 'products.backfill', collection: 'products', queryKey: 'products:backfill', priority: 100 });
    const taxes = state({ taskId: 'taxRates:all:greedy', requirementId: 'taxRates.all', collection: 'taxRates', queryKey: 'taxRates:all', priority: 1000, mode: 'greedy' });
    const productsInitial = state({ taskId: 'products:initial', requirementId: 'products.initial', collection: 'products', queryKey: 'products:initial', priority: 700 });
    // Repository returns them in NON-priority order.
    const repository = createRepository([backlog, taxes, productsInitial]);
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: 1, requestCount: 1, completed: true }));

    await runPersistedSchedulerTasks({ ...baseInput, repository, fetcher });

    const claimedOrder = (repository.claim as ReturnType<typeof vi.fn>).mock.calls.map((call) => (call[0] as PersistedSchedulerTaskState).taskId);
    expect(claimedOrder).toEqual(['taxRates:all:greedy', 'products:initial', 'products:backfill']);
  });

  it('renews unexpired scheduler state already owned by this runner before fetching it', async () => {
    const runnable = state({
      status: 'in-flight',
      ownerId: 'tab-runner',
      claimedUntilMs: 1_250,
      attempt: 1,
      retryAfterMs: null,
      updatedAtMs: 1_000,
    });
    const repository = createRepository([]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_700);
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));

    await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
      claimedStates: [runnable],
    });

    expect(repository.readRunnable).toHaveBeenCalledWith(900);
    const renewedState = {
      ...runnable,
      claimedUntilMs: 1_300,
      updatedAtMs: 1_000,
    };
    expect(repository.claim).toHaveBeenCalledWith(runnable, renewedState);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(repository.completeOrRequeue).toHaveBeenCalledWith(
      renewedState,
      {
        ...renewedState,
        status: 'completed',
        ownerId: null,
        claimedUntilMs: null,
        retryAfterMs: null,
        updatedAtMs: 1_700,
      },
      expect.objectContaining({ status: 'queued', attempt: 0 }),
    );
  });

  it('reclaims owned scheduler state when its lease expires before processing starts', async () => {
    const first = state({ taskId: 'orders:first', requirementId: 'orders.first' });
    const second = state({
      taskId: 'orders:second',
      requirementId: 'orders.second',
      status: 'in-flight',
      ownerId: 'tab-runner',
      claimedUntilMs: 1_050,
      attempt: 1,
      retryAfterMs: null,
      updatedAtMs: 900,
    });
    const repository = createRepository([first]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(2_000)
      .mockReturnValueOnce(2_100);
    const fetcher = vi.fn(async (task) => ({ taskId: task.id, documentCount: 1, requestCount: 1, completed: true }));

    await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
      claimedStates: [second],
    });

    expect(repository.claim).toHaveBeenNthCalledWith(2, second, expect.objectContaining({
      taskId: 'orders:second',
      claimedUntilMs: 2_300,
      updatedAtMs: 2_000,
      attempt: 2,
    }));
  });

  it('stamps completed scheduler state at fetch completion time', async () => {
    const runnable = state();
    const repository = createRepository([runnable]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_700);
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));

    await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
    });

    const claimedState = state({
      status: 'in-flight',
      ownerId: 'tab-runner',
      claimedUntilMs: 1_300,
      attempt: 2,
      retryAfterMs: null,
      updatedAtMs: 1_000,
    });
    expect(repository.completeOrRequeue).toHaveBeenCalledWith(
      claimedState,
      {
        ...claimedState,
        status: 'completed',
        ownerId: null,
        claimedUntilMs: null,
        updatedAtMs: 1_700,
      },
      expect.objectContaining({ status: 'queued', attempt: 0 }),
    );
  });

  it('marks the claimed scheduler state failed with retry backoff when fetching fails', async () => {
    const runnable = state({ status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: 900, retryAfterMs: null });
    const repository = createRepository([runnable]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_700);
    const fetcher = vi.fn(async () => {
      throw new Error('orders unavailable');
    });

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
    });

    const claimedState = state({
      status: 'in-flight',
      ownerId: 'tab-runner',
      claimedUntilMs: 1_300,
      attempt: 2,
      retryAfterMs: null,
      updatedAtMs: 1_000,
    });
    expect(repository.markFailed).toHaveBeenCalledWith(claimedState, {
      ...claimedState,
      status: 'failed',
      ownerId: null,
      claimedUntilMs: null,
      retryAfterMs: 2_200,
      updatedAtMs: 1_700,
    });
    expect(repository.completeOrRequeue).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it('does not report failed state persistence when the guarded failure update loses to a newer owner', async () => {
    const runnable = state({ status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: 900, retryAfterMs: null });
    const repository = createRepository([runnable], true, true, false);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_700);
    const fetcher = vi.fn(async () => {
      throw new Error('orders unavailable');
    });

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
    });

    expect(repository.markFailed).toHaveBeenCalled();
    expect(result.failed).toBe(0);
    expect(result.failureLost).toBe(1);
  });

  it('drains a lower-priority lane even when a higher-priority lane throws (failure isolation)', async () => {
    // Regression (1.9.x bug 00baa0c76): a failed lookup left the whole collection
    // sync paused forever — one lane's failure starved every other lane. The
    // durable runner must isolate a throwing lane (markFailed → continue) so a
    // DIFFERENT, lower-priority lane in the same run still drains to completion.
    const failing = state({ taskId: 'orders:open:windowed', requirementId: 'orders.unavailable', collection: 'orders', queryKey: 'orders:open', priority: 1000 });
    const draining = state({ taskId: 'products:initial', requirementId: 'products.initial', collection: 'products', queryKey: 'products:initial', priority: 500 });
    // Repository order is irrelevant; the runner sorts highest-priority-first, so
    // the FAILING lane is processed BEFORE the one that must still drain.
    const repository = createRepository([draining, failing]);
    const fetcher = vi.fn(async (task) => {
      if (task.requirementId === 'orders.unavailable') {
        throw new Error('orders unavailable');
      }
      return { taskId: task.id, documentCount: 5, requestCount: 1, completed: true };
    });

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
    });

    // Both lanes were attempted; the throw did not abort the run.
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    // The higher-priority lane failed…
    expect(repository.markFailed).toHaveBeenCalledTimes(1);
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'orders:open:windowed' }),
      expect.objectContaining({ taskId: 'orders:open:windowed', status: 'failed' }),
    );
    // …yet the lower-priority lane still drained to completion.
    expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
    expect(repository.completeOrRequeue).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'products:initial' }),
      expect.objectContaining({ taskId: 'products:initial', status: 'completed' }),
      expect.objectContaining({ taskId: 'products:initial', status: 'queued' }),
    );
  });

  it('continues a claimed greedy scheduler state until the fetcher reports completion', async () => {
    const runnable = state({ mode: 'greedy' });
    const repository = createRepository([runnable]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_200)
      .mockReturnValueOnce(1_500);
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: false })
      .mockResolvedValueOnce({ taskId: runnable.taskId, documentCount: 10, requestCount: 1, completed: true });

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(repository.claim).toHaveBeenCalledTimes(2);
    expect(repository.claim).toHaveBeenNthCalledWith(2, expect.objectContaining({
      taskId: runnable.taskId,
      claimedUntilMs: 1_300,
      updatedAtMs: 1_000,
    }), expect.objectContaining({
      taskId: runnable.taskId,
      claimedUntilMs: 1_500,
      updatedAtMs: 1_200,
      attempt: 2,
    }));
    expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(1);
    expect(result.totalDocuments).toBe(35);
    expect(result.totalRequests).toBe(2);
  });

  it('stops a greedy scheduler task when lease renewal loses to a newer owner', async () => {
    const runnable = state({ mode: 'greedy' });
    const repository = createRepository([runnable], [true, false]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_200);
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: false })
      .mockResolvedValueOnce({ taskId: runnable.taskId, documentCount: 10, requestCount: 1, completed: true });

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(repository.completeOrRequeue).not.toHaveBeenCalled();
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(result.renewalLost).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.totalDocuments).toBe(25);
    expect(result.totalRequests).toBe(1);
  });

  it('marks greedy fetch failures against the latest renewed scheduler state', async () => {
    const runnable = state({ mode: 'greedy' });
    const repository = createRepository([runnable]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_200)
      .mockReturnValueOnce(1_700);
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: false })
      .mockRejectedValueOnce(new Error('orders unavailable'));

    await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
    });

    const renewedState = state({
      mode: 'greedy',
      status: 'in-flight',
      ownerId: 'tab-runner',
      claimedUntilMs: 1_500,
      attempt: 2,
      retryAfterMs: null,
      updatedAtMs: 1_200,
    });
    expect(repository.markFailed).toHaveBeenCalledWith(renewedState, {
      ...renewedState,
      status: 'failed',
      ownerId: null,
      claimedUntilMs: null,
      retryAfterMs: 2_200,
      updatedAtMs: 1_700,
    });
  });

  it('uses per-task greedy request limits before the runner-wide default', async () => {
    const runnable = state({ mode: 'greedy', requirementId: 'orders.greedy.once' });
    const repository = createRepository([runnable]);
    const getNowMs = vi.fn()
      .mockReturnValueOnce(900)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_700);
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: false })
      .mockResolvedValueOnce({ taskId: runnable.taskId, documentCount: 10, requestCount: 1, completed: true });

    const result = await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      getNowMs,
      fetcher,
      maxRequestsPerTask: 3,
      maxRequestsForTask: (task) => task.requirementId === 'orders.greedy.once' ? 1 : undefined,
    });

    const claimedState = state({
      mode: 'greedy',
      requirementId: 'orders.greedy.once',
      status: 'in-flight',
      ownerId: 'tab-runner',
      claimedUntilMs: 1_300,
      attempt: 2,
      retryAfterMs: null,
      updatedAtMs: 1_000,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.markFailed).toHaveBeenCalledWith(claimedState, {
      ...claimedState,
      status: 'failed',
      ownerId: null,
      claimedUntilMs: null,
      retryAfterMs: 2_200,
      updatedAtMs: 1_700,
    });
    expect(result.failed).toBe(1);
    expect(result.totalDocuments).toBe(25);
    expect(result.totalRequests).toBe(1);
  });

  it('passes the caller abort signal to persisted scheduler fetchers', async () => {
    const runnable = state();
    const repository = createRepository([runnable]);
    const abortController = new AbortController();
    const fetcher = vi.fn(async () => ({ taskId: runnable.taskId, documentCount: 25, requestCount: 1, completed: true }));

    await runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
      signal: abortController.signal,
    });

    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ id: runnable.taskId }), {
      signal: abortController.signal,
    });
  });

  it('stops before claiming the next persisted task when the caller aborts the runner', async () => {
    const first = state({ taskId: 'orders:first', requirementId: 'orders.first' });
    const second = state({ taskId: 'orders:second', requirementId: 'orders.second' });
    const repository = createRepository([first, second]);
    const abortController = new AbortController();
    const fetcher = vi.fn(async (task) => {
      abortController.abort(new Error('runner abandoned'));
      return { taskId: task.id, documentCount: 1, requestCount: 1, completed: true };
    });

    await expect(runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
      signal: abortController.signal,
    })).rejects.toThrow('runner abandoned');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.completeOrRequeue).toHaveBeenCalledTimes(1);
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('propagates fetch aborts without marking the claimed persisted task failed', async () => {
    const runnable = state();
    const repository = createRepository([runnable]);
    const abortController = new AbortController();
    const abortReason = new Error('request abandoned');
    const fetcher = vi.fn(async () => {
      abortController.abort(abortReason);
      throw abortReason;
    });

    await expect(runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
      signal: abortController.signal,
    })).rejects.toThrow('request abandoned');

    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.completeOrRequeue).not.toHaveBeenCalled();
  });

  it('does not renew an incomplete greedy task after the caller aborts during fetch work', async () => {
    const runnable = state({ mode: 'greedy' });
    const repository = createRepository([runnable]);
    const abortController = new AbortController();
    const fetcher = vi.fn(async (task) => {
      abortController.abort(new Error('runner abandoned during batch'));
      return { taskId: task.id, documentCount: 25, requestCount: 1, completed: false };
    });

    await expect(runPersistedSchedulerTasks({
      ...baseInput,
      repository,
      fetcher,
      signal: abortController.signal,
    })).rejects.toThrow('runner abandoned during batch');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    expect(repository.markFailed).not.toHaveBeenCalled();
    expect(repository.completeOrRequeue).not.toHaveBeenCalled();
  });

});
