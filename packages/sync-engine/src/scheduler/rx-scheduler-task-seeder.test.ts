// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { seedPersistedSchedulerTasks, type SchedulerTaskSeederRepository } from './rx-scheduler-task-seeder';
import type { RerunOrReseedOutcome } from './rx-scheduler-task-state-repository';
import type { PersistedSchedulerTaskState } from './persisted-scheduler-state';
import type { FetchTask } from './replication-policy';

function task(overrides: Partial<FetchTask> & Pick<FetchTask, 'id' | 'requirementId'>): FetchTask {
  return {
    id: overrides.id,
    requirementId: overrides.requirementId,
    collection: overrides.collection ?? 'orders',
    queryKey: overrides.queryKey ?? overrides.id,
    ids: overrides.ids,
    limit: overrides.limit ?? 25,
    priority: overrides.priority ?? 100,
    mode: overrides.mode ?? 'windowed',
  };
}

function state(overrides: Partial<PersistedSchedulerTaskState> & Pick<PersistedSchedulerTaskState, 'taskId' | 'requirementId'>): PersistedSchedulerTaskState {
  return {
    taskId: overrides.taskId,
    requirementId: overrides.requirementId,
    collection: overrides.collection ?? 'orders',
    queryKey: overrides.queryKey ?? overrides.taskId,
    ids: overrides.ids,
    limit: overrides.limit ?? 25,
    priority: overrides.priority ?? 100,
    mode: overrides.mode ?? 'windowed',
    status: overrides.status ?? 'queued',
    ownerId: overrides.ownerId ?? null,
    claimedUntilMs: overrides.claimedUntilMs ?? null,
    attempt: overrides.attempt ?? 0,
    retryAfterMs: overrides.retryAfterMs ?? null,
    updatedAtMs: overrides.updatedAtMs ?? 1_000,
  };
}

function repository(
  existingStates: PersistedSchedulerTaskState[] = [],
  rerunOutcome: RerunOrReseedOutcome = 'rerun-requested',
): SchedulerTaskSeederRepository {
  return {
    readForTaskIds: vi.fn(async () => existingStates),
    claimNew: vi.fn(async () => true),
    claim: vi.fn(async () => true),
    requestRerunOrReseed: vi.fn(async () => rerunOutcome),
  };
}

describe('seedPersistedSchedulerTasks', () => {
  it('inserts absent tasks as queued scheduler state without claiming them', async () => {
    const repo = repository([]);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'orders:custom-pull:greedy', requirementId: 'orders.background', mode: 'greedy', limit: 100, priority: 100 })],
      nowMs: 10_000,
      completedDedupeForMs: 300_000,
    });

    expect(repo.readForTaskIds).toHaveBeenCalledWith(['orders:custom-pull:greedy']);
    expect(repo.claimNew).toHaveBeenCalledWith({
      taskId: 'orders:custom-pull:greedy',
      requirementId: 'orders.background',
      collection: 'orders',
      queryKey: 'orders:custom-pull:greedy',
      ids: undefined,
      limit: 100,
      priority: 100,
      mode: 'greedy',
      status: 'queued',
      ownerId: null,
      claimedUntilMs: null,
      attempt: 0,
      retryAfterMs: null,
      updatedAtMs: 10_000,
    });
    expect(repo.claim).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 1, requeued: 0, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 0, claimLost: 0, rerunRequested: 0 });
  });


  it('counts lost claims when inserting an absent task loses the guarded insert race', async () => {
    const repo = repository([]);
    vi.mocked(repo.claimNew).mockResolvedValueOnce(false);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'orders:claim-new-lost', requirementId: 'orders.background', mode: 'greedy', limit: 100, priority: 100 })],
      nowMs: 10_000,
      completedDedupeForMs: 300_000,
    });

    expect(repo.readForTaskIds).toHaveBeenCalledWith(['orders:claim-new-lost']);
    expect(repo.claimNew).toHaveBeenCalledWith({
      taskId: 'orders:claim-new-lost',
      requirementId: 'orders.background',
      collection: 'orders',
      queryKey: 'orders:claim-new-lost',
      ids: undefined,
      limit: 100,
      priority: 100,
      mode: 'greedy',
      status: 'queued',
      ownerId: null,
      claimedUntilMs: null,
      attempt: 0,
      retryAfterMs: null,
      updatedAtMs: 10_000,
    });
    expect(repo.claim).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0, requeued: 0, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 0, claimLost: 1, rerunRequested: 0 });
  });

  it('keeps recently completed tasks completed during the dedupe window', async () => {
    const existing = state({ taskId: 'orders:custom-pull:greedy', requirementId: 'orders.background', status: 'completed', updatedAtMs: 9_000, attempt: 4 });
    const repo = repository([existing]);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'orders:custom-pull:greedy', requirementId: 'orders.background' })],
      nowMs: 10_000,
      completedDedupeForMs: 5_000,
    });

    expect(repo.claimNew).not.toHaveBeenCalled();
    expect(repo.claim).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0, requeued: 0, skippedActive: 0, skippedCompleted: 1, skippedRunnable: 0, claimLost: 0, rerunRequested: 0 });
  });

  it('disables completed-dedupe on a non-positive window — re-seeds even at delta 0 (fresh change-signal pull)', async () => {
    // A change-signal pull seeds with completedDedupeForMs: 0. A task completed at
    // the EXACT same nowMs (delta 0, e.g. a fixed injected clock) must still re-seed
    // rather than be dropped by a `<= 0` window (codex review round-2).
    const existing = state({ taskId: 'products:ids:7', requirementId: 'products.targeted.7', status: 'completed', updatedAtMs: 10_000, attempt: 0 });
    const repo = repository([existing]);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'products:ids:7', requirementId: 'products.targeted.7' })],
      nowMs: 10_000,
      completedDedupeForMs: 0,
    });

    expect(result.skippedCompleted).toBe(0);
    expect(result.requeued).toBe(1);
  });

  it('requeues stale completed tasks with a guarded write and preserves attempt count', async () => {
    const existing = state({ taskId: 'orders:custom-pull:greedy', requirementId: 'orders.old', status: 'completed', updatedAtMs: 1_000, attempt: 4, priority: 50, limit: 25 });
    const repo = repository([existing]);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'orders:custom-pull:greedy', requirementId: 'orders.background', mode: 'greedy', limit: 100, priority: 100 })],
      nowMs: 10_000,
      completedDedupeForMs: 5_000,
    });

    expect(repo.claimNew).not.toHaveBeenCalled();
    expect(repo.claim).toHaveBeenCalledWith(existing, {
      ...existing,
      requirementId: 'orders.background',
      queryKey: 'orders:custom-pull:greedy',
      limit: 100,
      priority: 100,
      mode: 'greedy',
      status: 'queued',
      ownerId: null,
      claimedUntilMs: null,
      attempt: 4,
      retryAfterMs: null,
      updatedAtMs: 10_000,
    });
    expect(result).toEqual({ inserted: 0, requeued: 1, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 0, claimLost: 0, rerunRequested: 0 });
  });


  it('counts lost claims when requeueing a stale completed task loses the guarded write race', async () => {
    const existing = state({ taskId: 'orders:claim-lost', requirementId: 'orders.old', status: 'completed', updatedAtMs: 1_000, attempt: 4, priority: 50, limit: 25 });
    const repo = repository([existing]);
    vi.mocked(repo.claim).mockResolvedValueOnce(false);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'orders:claim-lost', requirementId: 'orders.background', mode: 'greedy', limit: 100, priority: 100 })],
      nowMs: 10_000,
      completedDedupeForMs: 5_000,
    });

    expect(repo.claimNew).not.toHaveBeenCalled();
    expect(repo.claim).toHaveBeenCalledWith(existing, {
      ...existing,
      requirementId: 'orders.background',
      queryKey: 'orders:claim-lost',
      limit: 100,
      priority: 100,
      mode: 'greedy',
      status: 'queued',
      ownerId: null,
      claimedUntilMs: null,
      attempt: 4,
      retryAfterMs: null,
      updatedAtMs: 10_000,
    });
    expect(result).toEqual({ inserted: 0, requeued: 0, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 0, claimLost: 1, rerunRequested: 0 });
  });

  it('flags an in-flight row for coalesced re-run when coalesceInFlight is set, leaving queued/failed runnable', async () => {
    // Coalescing is an EXPLICIT opt-in (only change-signal refresh lanes set it). An in-flight
    // row is handed to requestRerunOrReseed so the running fetch re-runs (it may have read
    // past this change). Queued/failed rows are already runnable and left as-is.
    const queued = state({ taskId: 'orders:queued', requirementId: 'orders.queued', status: 'queued' });
    const inFlight = state({ taskId: 'orders:in-flight', requirementId: 'orders.in-flight', status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: 11_000, attempt: 1 });
    const failed = state({ taskId: 'orders:failed', requirementId: 'orders.failed', status: 'failed', retryAfterMs: 9_000, attempt: 2 });
    const repo = repository([queued, inFlight, failed]);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [
        task({ id: 'orders:queued', requirementId: 'orders.queued' }),
        task({ id: 'orders:in-flight', requirementId: 'orders.in-flight' }),
        task({ id: 'orders:failed', requirementId: 'orders.failed' }),
      ],
      nowMs: 10_000,
      completedDedupeForMs: 0,
      coalesceInFlight: true,
    });

    expect(repo.claimNew).not.toHaveBeenCalled();
    expect(repo.claim).not.toHaveBeenCalled();
    expect(repo.requestRerunOrReseed).toHaveBeenCalledTimes(1);
    expect(repo.requestRerunOrReseed).toHaveBeenCalledWith(
      inFlight,
      expect.objectContaining({ taskId: 'orders:in-flight', status: 'queued', attempt: 1 }),
      10_000,
    );
    expect(result).toEqual({ inserted: 0, requeued: 0, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 2, claimLost: 0, rerunRequested: 1 });
  });

  it('keeps skippedActive for a non-opted-in seed — even with a zero dedupe window (bootstrap/F11/targeted)', async () => {
    // Coalescing is gated on the EXPLICIT coalesceInFlight flag, NOT on completedDedupeForMs.
    // A zero-dedupe startup/bootstrap seed (which is NOT a server mutation) must keep the old
    // skippedActive behavior so a reload while a greedy lane is in-flight doesn't force an
    // extra rerun (codex P2 — the dedupe heuristic was too broad).
    const inFlight = state({ taskId: 'orders:in-flight', requirementId: 'orders.in-flight', status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: 11_000, attempt: 1 });
    const repo = repository([inFlight]);

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'orders:in-flight', requirementId: 'orders.in-flight' })],
      nowMs: 10_000,
      completedDedupeForMs: 0, // zero dedupe, but NOT opted into coalescing
    });

    expect(repo.requestRerunOrReseed).not.toHaveBeenCalled();
    expect(result).toEqual({ inserted: 0, requeued: 0, skippedActive: 1, skippedCompleted: 0, skippedRunnable: 0, claimLost: 0, rerunRequested: 0 });
  });

  it('re-queues (not flags) when the in-flight task settled to completed between read and write', async () => {
    // Race: the owner completed between our batch read and the atomic op. requestRerunOrReseed
    // returns 'requeued' (it re-seeded a fresh run directly), counted under requeued.
    const inFlight = state({ taskId: 'orders:in-flight', requirementId: 'orders.in-flight', status: 'in-flight', ownerId: 'tab-a', claimedUntilMs: 11_000, attempt: 1 });
    const repo = repository([inFlight], 'requeued');

    const result = await seedPersistedSchedulerTasks({
      repository: repo,
      tasks: [task({ id: 'orders:in-flight', requirementId: 'orders.in-flight' })],
      nowMs: 10_000,
      completedDedupeForMs: 0,
      coalesceInFlight: true,
    });

    expect(result).toEqual({ inserted: 0, requeued: 1, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 0, claimLost: 0, rerunRequested: 0 });
  });
});
