// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { seedSchedulerTasksFromQueryDeclarations } from './rx-query-requirement-scheduler-seeder';
import type { QueryRequirementDeclaration } from './query-requirement-library';
import type { PersistedCoverageDocumentSet } from './persisted-coverage-schema';
import type { SchedulerTaskSeederRepository } from '@woo-rxdb-lab/sync-engine-rxdb/testing';

const serveLocalPolicy = {
  mode: 'windowed' as const,
  priority: 600,
  batchSize: 25,
  offline: { read: 'serve-local' as const, write: 'queue' as const },
};

function declaration(overrides: Partial<QueryRequirementDeclaration> & Pick<QueryRequirementDeclaration, 'id' | 'collection' | 'queryKey'>): QueryRequirementDeclaration {
  return {
    componentId: overrides.componentId ?? 'TestComponent',
    id: overrides.id,
    collection: overrides.collection,
    kind: overrides.kind ?? 'query',
    queryKey: overrides.queryKey,
    ids: overrides.ids,
    expectedRecordIds: overrides.expectedRecordIds,
    currentRecordIds: overrides.currentRecordIds,
    totalMatchingRecords: overrides.totalMatchingRecords,
    coverageStrategy: overrides.coverageStrategy ?? 'record-and-lane',
    policy: overrides.policy ?? serveLocalPolicy,
  };
}

function schedulerRepository(): SchedulerTaskSeederRepository {
  return {
    readForTaskIds: vi.fn(async () => []),
    claimNew: vi.fn(async () => true),
    claim: vi.fn(async () => true),
    requestRerunOrReseed: vi.fn(async () => 'rerun-requested' as const),
  };
}

describe('seedSchedulerTasksFromQueryDeclarations', () => {
  it('seeds persisted scheduler tasks only for declarations that are not fresh in coverage', async () => {
    const coverageDocuments: PersistedCoverageDocumentSet = {
      records: [{ collection: 'products', id: 'woo-product:1', coveredQueryKeys: ['products:search:keyboard'], freshUntilMs: 20_000, updatedAtMs: 9_000 }],
      lanes: [{ collection: 'products', queryKey: 'products:search:keyboard', complete: true, expectedRecordIds: ['woo-product:1'], freshUntilMs: 20_000, updatedAtMs: 9_000 }],
    };
    const coverageRepository = { readSnapshot: vi.fn(async () => coverageDocuments) };
    const repo = schedulerRepository();

    const result = await seedSchedulerTasksFromQueryDeclarations({
      coverageRepository,
      schedulerRepository: repo,
      connectivity: 'online',
      declarations: [
        declaration({ id: 'products.search.keyboard', collection: 'products', queryKey: 'products:search:keyboard' }),
        declaration({ id: 'customers.search.alex', collection: 'customers', queryKey: 'customers:search=alex:limit=25' }),
      ],
      nowMs: 10_000,
      completedDedupeForMs: 300_000,
    });

    expect(coverageRepository.readSnapshot).toHaveBeenCalledTimes(1);
    expect(repo.readForTaskIds).toHaveBeenCalledWith(['customers:customers:search=alex:limit=25:windowed']);
    expect(repo.claimNew).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'customers:customers:search=alex:limit=25:windowed',
      requirementId: 'customers.search.alex',
      collection: 'customers',
      queryKey: 'customers:search=alex:limit=25',
      limit: 25,
      priority: 600,
      mode: 'windowed',
      status: 'queued',
    }));
    expect(result.plannedTasks.map((task) => task.requirementId)).toEqual(['customers.search.alex']);
    expect(result.coverageDecisions.map((decision) => [decision.requirementId, decision.action])).toEqual([
      ['products.search.keyboard', 'serve-local'],
      ['customers.search.alex', 'fetch-remote'],
    ]);
    expect(result.seedResult).toEqual({ inserted: 1, requeued: 0, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 0, claimLost: 0, rerunRequested: 0 });
  });

  it('uses one coverage snapshot so a concurrent lane update cannot tear expected ids from state', async () => {
    const coveredSnapshot: PersistedCoverageDocumentSet = {
      records: [{ collection: 'products', id: 'woo-product:1', coveredQueryKeys: ['products:search:keyboard'], freshUntilMs: 20_000, updatedAtMs: 9_000 }],
      lanes: [{ collection: 'products', queryKey: 'products:search:keyboard', complete: true, expectedRecordIds: ['woo-product:1'], freshUntilMs: 20_000, updatedAtMs: 9_000 }],
    };
    const initialSnapshot: PersistedCoverageDocumentSet = { records: [], lanes: [] };
    // A second read would see a fresh complete lane after the coverage document changes.
    // Combining that state with the first read's empty expected ids was the torn-read bug.
    const snapshots = [initialSnapshot, coveredSnapshot];
    const coverageRepository = {
      readSnapshot: vi.fn(async () => snapshots.shift() ?? coveredSnapshot),
    };
    const repo = schedulerRepository();

    const result = await seedSchedulerTasksFromQueryDeclarations({
      coverageRepository,
      schedulerRepository: repo,
      connectivity: 'online',
      declarations: [declaration({ id: 'products.search.keyboard', collection: 'products', queryKey: 'products:search:keyboard' })],
      nowMs: 10_000,
      completedDedupeForMs: 300_000,
    });

    expect(coverageRepository.readSnapshot).toHaveBeenCalledTimes(1);
    expect(result.coverageDecisions).toEqual([expect.objectContaining({ action: 'fetch-remote' })]);
    expect(repo.claimNew).toHaveBeenCalledTimes(1);
  });

  it('fetches when a complete fresh lane expects records that are not fresh locally', async () => {
    const coverageRepository = {
      readSnapshot: vi.fn(async (): Promise<PersistedCoverageDocumentSet> => ({
        records: [],
        lanes: [{
          collection: 'products',
          queryKey: 'products:search:keyboard',
          complete: true,
          expectedRecordIds: ['woo-product:1'],
          freshUntilMs: 20_000,
          updatedAtMs: 9_000,
        }],
      })),
    };
    const repo = schedulerRepository();

    const result = await seedSchedulerTasksFromQueryDeclarations({
      coverageRepository,
      schedulerRepository: repo,
      connectivity: 'online',
      declarations: [declaration({ id: 'products.search.keyboard', collection: 'products', queryKey: 'products:search:keyboard' })],
      nowMs: 10_000,
      completedDedupeForMs: 300_000,
    });

    expect(result.coverageDecisions).toEqual([expect.objectContaining({
      action: 'fetch-remote',
      missingRecordIds: ['woo-product:1'],
    })]);
    expect(repo.claimNew).toHaveBeenCalledTimes(1);
  });

  it('skips oversized declaration keys without aborting valid scheduler tasks', async () => {
    const coverageRepository = { readSnapshot: vi.fn(async () => ({ records: [], lanes: [] })) };
    const repo = schedulerRepository();
    const longQueryKey = `products:search:${'x'.repeat(260)}`;

    const result = await seedSchedulerTasksFromQueryDeclarations({
      coverageRepository,
      schedulerRepository: repo,
      connectivity: 'online',
      declarations: [
        declaration({ id: 'products.search.long', collection: 'products', queryKey: longQueryKey }),
        declaration({ id: 'customers.search.alex', collection: 'customers', queryKey: 'customers:search=alex:limit=25' }),
      ],
      nowMs: 10_000,
      completedDedupeForMs: 300_000,
    });

    expect(repo.readForTaskIds).toHaveBeenCalledWith(['customers:customers:search=alex:limit=25:windowed']);
    expect(repo.claimNew).toHaveBeenCalledTimes(1);
    expect(result.invalidTasks).toEqual([{
      taskId: `products:${longQueryKey}:windowed`,
      requirementId: 'products.search.long',
      reason: `queryKey exceeds persisted scheduler limit: ${longQueryKey.length} > 256`,
    }]);
    expect(result.plannedTasks.map((task) => task.requirementId)).toEqual(['customers.search.alex']);
  });

  it('honors offline scheduler planning before seeding tasks', async () => {
    const coverageRepository = { readSnapshot: vi.fn(async () => ({ records: [], lanes: [] })) };
    const repo = schedulerRepository();

    const result = await seedSchedulerTasksFromQueryDeclarations({
      coverageRepository,
      schedulerRepository: repo,
      connectivity: 'offline',
      declarations: [
        declaration({ id: 'products.search.keyboard', collection: 'products', queryKey: 'products:search:keyboard' }),
      ],
      nowMs: 10_000,
      completedDedupeForMs: 300_000,
    });

    expect(repo.readForTaskIds).toHaveBeenCalledWith([]);
    expect(repo.claimNew).not.toHaveBeenCalled();
    expect(result.skipped).toEqual([{ requirementId: 'products.search.keyboard', reason: 'offline: served local data only' }]);
    expect(result.seedResult).toEqual({ inserted: 0, requeued: 0, skippedActive: 0, skippedCompleted: 0, skippedRunnable: 0, claimLost: 0, rerunRequested: 0 });
  });
});
